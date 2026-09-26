import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseBounds,
  parseUiHierarchyXml,
  findUiNodes,
  resolveKeyCode,
  escapeInputText,
  KEY_CODE_MAP,
  tapCoordinates,
  tapElement,
  inputText,
  pressKey,
  swipeScreen,
  openDeepLink
} from '../out/index.js';

const SAMPLE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="Welcome to App" resource-id="com.example.app:id/tv_title" class="android.widget.TextView" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,200][980,300]" />
    <node index="1" text="Login" resource-id="com.example.app:id/btn_login" class="android.widget.Button" package="com.example.app" content-desc="Submit login" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,500][980,620]" />
    <node index="2" text="" resource-id="" class="android.widget.LinearLayout" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,650][1080,800]">
      <node index="0" text="Settings" resource-id="com.example.app:id/action_settings" class="android.widget.TextView" package="com.example.app" content-desc="Open Settings" checkable="false" checked="false" clickable="true" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[50,680][300,750]" />
    </node>
  </node>
</hierarchy>`;

function createMockRunner(responses = {}) {
  const calls = [];
  return {
    calls,
    run: async (deviceId, args) => {
      calls.push({ deviceId, args });
      const cmdKey = args.join(' ');
      for (const [pattern, res] of Object.entries(responses)) {
        if (cmdKey.includes(pattern)) {
          return typeof res === 'function' ? res(args) : res;
        }
      }
      return '';
    },
    runBinary: async (deviceId, args) => {
      calls.push({ deviceId, args, binary: true });
      return Buffer.from('FAKE_PNG_BYTES');
    }
  };
}

test('parseBounds calculates coordinates, center, and dimensions', () => {
  const bounds = parseBounds('[100,200][900,600]');
  assert.equal(bounds.left, 100);
  assert.equal(bounds.top, 200);
  assert.equal(bounds.right, 900);
  assert.equal(bounds.bottom, 600);
  assert.equal(bounds.centerX, 500);
  assert.equal(bounds.centerY, 400);
  assert.equal(bounds.width, 800);
  assert.equal(bounds.height, 400);
});

test('parseUiHierarchyXml parses nodes and hierarchy', () => {
  const result = parseUiHierarchyXml(SAMPLE_XML);
  assert.equal(result.totalNodes, 5);
  assert.equal(result.nodes.length, 5);
  assert.ok(result.root);
  assert.equal(result.root.className, 'android.widget.FrameLayout');

  const titleNode = result.nodes.find(n => n.resourceId === 'com.example.app:id/tv_title');
  assert.ok(titleNode);
  assert.equal(titleNode.text, 'Welcome to App');
  assert.equal(titleNode.clickable, false);

  const loginNode = result.nodes.find(n => n.resourceId === 'com.example.app:id/btn_login');
  assert.ok(loginNode);
  assert.equal(loginNode.text, 'Login');
  assert.equal(loginNode.clickable, true);
  assert.equal(loginNode.contentDesc, 'Submit login');
  assert.equal(loginNode.bounds.centerX, 540);
  assert.equal(loginNode.bounds.centerY, 560);
});

test('parseUiHierarchyXml with compressed: true omits uninformative container nodes', () => {
  const uncompressed = parseUiHierarchyXml(SAMPLE_XML, { compressed: false });
  const compressed = parseUiHierarchyXml(SAMPLE_XML, { compressed: true });

  assert.equal(uncompressed.nodes.length, 5);
  // LinearLayout container with no text/desc/id/actions is filtered out
  assert.equal(compressed.nodes.length, 3);
  assert.ok(compressed.nodes.some(n => n.text === 'Welcome to App'));
  assert.ok(compressed.nodes.some(n => n.text === 'Login'));
  assert.ok(compressed.nodes.some(n => n.text === 'Settings'));
});

test('findUiNodes filters by text, resourceId, and contentDesc', () => {
  const { nodes } = parseUiHierarchyXml(SAMPLE_XML);

  const byText = findUiNodes(nodes, { text: 'login' });
  assert.equal(byText.length, 1);
  assert.equal(byText[0].resourceId, 'com.example.app:id/btn_login');

  const byRes = findUiNodes(nodes, { resourceId: 'btn_login' });
  assert.equal(byRes.length, 1);
  assert.equal(byRes[0].text, 'Login');

  const byDesc = findUiNodes(nodes, { contentDesc: 'Open Settings' });
  assert.equal(byDesc.length, 1);
  assert.equal(byDesc[0].text, 'Settings');

  const clickableOnly = findUiNodes(nodes, { clickableOnly: true });
  assert.equal(clickableOnly.length, 2);
});

test('resolveKeyCode handles named keys and keycodes', () => {
  assert.equal(resolveKeyCode('HOME'), 3);
  assert.equal(resolveKeyCode('back'), 4);
  assert.equal(resolveKeyCode('ENTER'), 66);
  assert.equal(resolveKeyCode('RECENTS'), 187);
  assert.equal(resolveKeyCode('APP_SWITCH'), 187);
  assert.equal(resolveKeyCode('VOLUP'), 24);
  assert.equal(resolveKeyCode(4), 4);
  assert.equal(resolveKeyCode('66'), 66);
});

test('escapeInputText escapes spaces and shell characters properly', () => {
  const escaped = escapeInputText('Hello World! (Test & $100)');
  assert.equal(escaped, 'Hello%sWorld!%s\\(Test%s\\&%s\\$100\\)');
});

test('tapCoordinates runs adb input tap', async () => {
  const runner = createMockRunner();
  const res = await tapCoordinates(runner, 'dev1', 540.2, 960.8);
  assert.deepEqual(res, { x: 540, y: 961 });
  assert.equal(runner.calls.length, 1);
  assert.deepEqual(runner.calls[0].args, ['shell', 'input', 'tap', '540', '961']);
});

test('tapElement resolves element from hierarchy and taps center', async () => {
  const runner = createMockRunner({
    'uiautomator dump': 'UI hierchary dumped to: /data/local/tmp/uidump.xml',
    'cat /data/local/tmp/uidump.xml': SAMPLE_XML
  });

  const res = await tapElement(runner, 'dev1', { text: 'Login' });
  assert.equal(res.tapped, true);
  assert.equal(res.x, 540);
  assert.equal(res.y, 560);
  assert.equal(res.element.resourceId, 'com.example.app:id/btn_login');
});

test('inputText escapes text and executes input text', async () => {
  const runner = createMockRunner();
  await inputText(runner, 'dev1', 'User Name 123');
  assert.equal(runner.calls.length, 1);
  assert.deepEqual(runner.calls[0].args, ['shell', 'input', 'text', 'User%sName%s123']);
});

test('pressKey dispatches keyevent', async () => {
  const runner = createMockRunner();
  const res = await pressKey(runner, 'dev1', 'BACK');
  assert.deepEqual(res, { key: 'BACK', keyCode: 4 });
  assert.equal(runner.calls.length, 1);
  assert.deepEqual(runner.calls[0].args, ['shell', 'input', 'keyevent', '4']);
});

test('swipeScreen with direction computes screen bounds and dispatches swipe', async () => {
  const runner = createMockRunner({
    'wm size': 'Physical size: 1080x2400'
  });

  const res = await swipeScreen(runner, 'dev1', { direction: 'up', durationMs: 400 });
  assert.deepEqual(res, {
    startX: 540,
    startY: 1800,
    endX: 540,
    endY: 600,
    durationMs: 400
  });

  const swipeCall = runner.calls.find(c => c.args.includes('swipe'));
  assert.ok(swipeCall);
  assert.deepEqual(swipeCall.args, ['shell', 'input', 'swipe', '540', '1800', '540', '600', '400']);
});

test('openDeepLink dispatches am start intent', async () => {
  const runner = createMockRunner({
    'am start': 'Starting: Intent { act=android.intent.action.VIEW dat=https://example.com/item/1 }'
  });

  const res = await openDeepLink(runner, 'dev1', 'https://example.com/item/1', 'com.example.app');
  assert.equal(res.url, 'https://example.com/item/1');
  assert.equal(res.packageName, 'com.example.app');
  assert.ok(res.output.includes('Starting: Intent'));
  assert.deepEqual(runner.calls[0].args, [
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'https://example.com/item/1',
    '-p',
    'com.example.app'
  ]);
});
