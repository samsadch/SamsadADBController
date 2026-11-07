import assert from 'node:assert/strict';
import test from 'node:test';
import {
  tapBySelector,
  assertUiElement,
  checkAndroidCliAvailable,
  listStreamingDevices
} from '../out/index.js';

const SAMPLE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
    <node index="0" text="Sign In" resource-id="com.example.app:id/btn_login" class="android.widget.Button" package="com.example.app" content-desc="Submit Login" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,500][980,650]" />
    <node index="1" text="Welcome Back" resource-id="com.example.app:id/title" class="android.widget.TextView" package="com.example.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,300][980,450]" />
  </node>
</hierarchy>`;

test('tapBySelector locates element by text and dispatches tap to center coordinates', async () => {
  const recorded = [];
  const fakeRunner = {
    run: async (dev, args) => {
      recorded.push({ dev, args });
      if (args.includes('cat') && args.includes('/data/local/tmp/uidump.xml')) {
        return SAMPLE_XML;
      }
      return '';
    }
  };

  const res = await tapBySelector(fakeRunner, 'device-1', { text: 'Sign In' });
  assert.equal(res.tapped, true);
  // Center of [100,500][980,650] -> x=(100+980)/2=540, y=(500+650)/2=575
  assert.equal(res.x, 540);
  assert.equal(res.y, 575);

  const tapCommand = recorded.find(r => r.args[0] === 'shell' && r.args[1] === 'input' && r.args[2] === 'tap');
  assert.ok(tapCommand);
  assert.equal(tapCommand.args[3], '540');
  assert.equal(tapCommand.args[4], '575');
});

test('assertUiElement detects existence and match count accurately', async () => {
  const fakeRunner = {
    run: async () => SAMPLE_XML
  };

  const resFound = await assertUiElement(fakeRunner, 'device-1', { resourceId: 'com.example.app:id/btn_login' });
  assert.equal(resFound.found, true);
  assert.equal(resFound.matchCount, 1);

  const resNotFound = await assertUiElement(fakeRunner, 'device-1', { text: 'Non-existent element' });
  assert.equal(resNotFound.found, false);
  assert.equal(resNotFound.matchCount, 0);
});

test('checkAndroidCliAvailable and listStreamingDevices safely handle environment without throwing', async () => {
  const available = await checkAndroidCliAvailable();
  assert.equal(typeof available, 'boolean');

  const devices = await listStreamingDevices();
  assert.ok(Array.isArray(devices));
});
