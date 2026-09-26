import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer, SERVER_VERSION, SERVER_NAME } from '../out/server.js';

test('createServer registers all Phase 0, Phase 1, Phase 2, and Phase 3 tools and matches version 0.0.2', () => {
  assert.equal(SERVER_NAME, 'adb-mcp');
  assert.equal(SERVER_VERSION, '0.0.2');

  const { server, target } = createServer();
  assert.ok(server);
  assert.ok(target);

  const registeredTools = Object.keys(server._registeredTools || {});
  const expectedTools = [
    // Phase 0
    'list_devices',
    'set_target',
    'get_device_info',
    // Phase 1
    'take_screenshot',
    'dump_view_hierarchy',
    'tap_coordinates',
    'tap_element',
    'input_text',
    'press_key',
    'swipe_screen',
    'open_deep_link',
    // Phase 2
    'install_app',
    'uninstall_app',
    'list_packages',
    'start_app',
    'stop_app',
    'restart_app',
    'clear_app_data',
    'grant_permission',
    'revoke_permission',
    'get_app_info',
    // Phase 3
    'list_databases',
    'inspect_database_overview',
    'list_database_tables',
    'get_table_schema',
    'get_table_data',
    'create_database_table',
    'query_database',
    'delete_database_row',
    'clear_database_table',
    'export_database',
    'list_shared_preferences',
    'read_shared_preferences',
    'get_shared_preference',
    'set_shared_preference',
    'delete_shared_preference',
    'clear_shared_preferences'
  ];

  for (const toolName of expectedTools) {
    assert.ok(
      registeredTools.includes(toolName),
      `Expected tool ${toolName} to be registered in createServer()`
    );
  }
});

test('MCP Phase 0 & Phase 1 tool handlers execute cleanly', async () => {
  const { server, target } = createServer();
  const tools = server._registeredTools;

  target.adb.runner.runAdb = async (_deviceId, ...args) => {
    const cmd = args.join(' ');
    if (cmd.startsWith('devices -l')) {
      return 'List of devices attached\nemulator-5554   device  product:sdk model:sdk_gphone64\n';
    }
    if (cmd.startsWith('shell getprop')) {
      return '[ro.product.model]: [Pixel 8]\n[ro.build.version.release]: [14]\n';
    }
    return '';
  };

  target.adb.runner.run = async (_deviceId, args) => {
    const cmd = args.join(' ');
    if (cmd.includes('uiautomator dump')) {
      return 'UI hierchary dumped to: /data/local/tmp/uidump.xml';
    }
    if (cmd.includes('cat /data/local/tmp/uidump.xml')) {
      return `<hierarchy rotation="0"><node index="0" text="Submit" resource-id="com.example:id/btn" class="android.widget.Button" package="com.example" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[100,100][200,200]" /></hierarchy>`;
    }
    if (cmd.includes('wm size')) {
      return 'Physical size: 1080x2400';
    }
    return 'Success';
  };

  target.adb.runner.runBinary = async () => {
    return Buffer.from('FAKE_PNG_BINARY');
  };

  // 1. list_devices
  const devRes = await tools['list_devices'].handler({});
  assert.equal(devRes.isError, undefined);
  assert.ok(devRes.content[0].text.includes('emulator-5554'));

  // 2. set_target
  const setTargetRes = await tools['set_target'].handler({ device: 'emulator-5554', packageName: 'com.example.app' });
  assert.equal(setTargetRes.isError, undefined);
  assert.equal(target.snapshot().device, 'emulator-5554');
  assert.equal(target.snapshot().package, 'com.example.app');

  // 3. get_device_info
  const infoRes = await tools['get_device_info'].handler({});
  assert.equal(infoRes.isError, undefined);
  assert.ok(infoRes.content[0].text.includes('Pixel 8'));

  // 4. take_screenshot (multimodal image result)
  const shotRes = await tools['take_screenshot'].handler({});
  assert.equal(shotRes.isError, undefined);
  assert.equal(shotRes.content[0].type, 'image');
  assert.equal(shotRes.content[0].mimeType, 'image/png');

  // 5. dump_view_hierarchy
  const hierarchyRes = await tools['dump_view_hierarchy'].handler({});
  assert.equal(hierarchyRes.isError, undefined);
  const hierarchyJson = JSON.parse(hierarchyRes.content[0].text);
  assert.equal(hierarchyJson.totalNodes, 1);
  assert.equal(hierarchyJson.nodes[0].text, 'Submit');

  // 6. tap_coordinates
  const tapCoordRes = await tools['tap_coordinates'].handler({ x: 150, y: 150 });
  assert.equal(tapCoordRes.isError, undefined);

  // 7. tap_element
  const tapElemRes = await tools['tap_element'].handler({ text: 'Submit' });
  assert.equal(tapElemRes.isError, undefined);
  const tapElemJson = JSON.parse(tapElemRes.content[0].text);
  assert.equal(tapElemJson.tapped, true);
  assert.equal(tapElemJson.tappedCoordinates.x, 150);
  assert.equal(tapElemJson.tappedCoordinates.y, 150);

  // 8. input_text
  const inputRes = await tools['input_text'].handler({ text: 'Hello World' });
  assert.equal(inputRes.isError, undefined);
  assert.match(inputRes.content[0].text, /Typed "Hello World"/);

  // 9. press_key
  const keyRes = await tools['press_key'].handler({ key: 'BACK' });
  assert.equal(keyRes.isError, undefined);
  const keyJson = JSON.parse(keyRes.content[0].text);
  assert.equal(keyJson.keyCode, 4);

  // 10. swipe_screen
  const swipeRes = await tools['swipe_screen'].handler({ direction: 'up' });
  assert.equal(swipeRes.isError, undefined);
  const swipeJson = JSON.parse(swipeRes.content[0].text);
  assert.equal(swipeJson.swipe.startY, 1800);
  assert.equal(swipeJson.swipe.endY, 600);

  // 11. open_deep_link
  const deepRes = await tools['open_deep_link'].handler({ url: 'https://example.com/details' });
  assert.equal(deepRes.isError, undefined);
  const deepJson = JSON.parse(deepRes.content[0].text);
  assert.equal(deepJson.opened, true);
  assert.equal(deepJson.url, 'https://example.com/details');
});

test('MCP Phase 2 tool handlers execute cleanly and adhere to target pinning', async () => {
  const { server, target } = createServer();
  target.setDevice('emulator-5554');
  target.setPackage('com.example.testapp');

  const recordedCalls = [];
  target.adb.runner.run = async (deviceId, args) => {
    recordedCalls.push({ deviceId, args });
    const cmd = args.join(' ');
    if (cmd.includes('pm list packages')) {
      return 'package:com.example.testapp\npackage:org.example.other';
    }
    if (cmd.includes('dumpsys package')) {
      return 'Packages:\n  Package [com.example.testapp] (123):\n    versionName=1.0.0\n    versionCode=10\n    requested permissions:\n      android.permission.CAMERA\n';
    }
    return 'Success';
  };

  const tools = server._registeredTools;

  // 1. list_packages
  const listRes = await tools['list_packages'].handler({ filter: 'third_party' });
  assert.equal(listRes.isError, undefined);
  assert.ok(listRes.content[0].text.includes('com.example.testapp'));

  // 2. start_app with sticky package
  const startRes = await tools['start_app'].handler({ activity: '.MainActivity', stopFirst: true });
  assert.equal(startRes.isError, undefined);
  assert.match(startRes.content[0].text, /Started com.example.testapp/);

  // 3. stop_app
  const stopRes = await tools['stop_app'].handler({});
  assert.equal(stopRes.isError, undefined);
  assert.match(stopRes.content[0].text, /Force-stopped com.example.testapp/);

  // 4. restart_app
  const restartRes = await tools['restart_app'].handler({});
  assert.equal(restartRes.isError, undefined);
  assert.match(restartRes.content[0].text, /Restarted com.example.testapp/);

  // 5. clear_app_data
  const clearRes = await tools['clear_app_data'].handler({ restart: true });
  assert.equal(clearRes.isError, undefined);
  assert.match(clearRes.content[0].text, /Cleared data for com.example.testapp/);

  // 6. grant_permission
  const grantRes = await tools['grant_permission'].handler({ permission: 'CAMERA' });
  assert.equal(grantRes.isError, undefined);
  const grantJson = JSON.parse(grantRes.content[0].text);
  assert.equal(grantJson.permission, 'android.permission.CAMERA');
  assert.equal(grantJson.granted, true);

  // 7. revoke_permission
  const revokeRes = await tools['revoke_permission'].handler({ permission: 'CAMERA' });
  assert.equal(revokeRes.isError, undefined);
  const revokeJson = JSON.parse(revokeRes.content[0].text);
  assert.equal(revokeJson.permission, 'android.permission.CAMERA');
  assert.equal(revokeJson.revoked, true);

  // 8. get_app_info
  const infoRes = await tools['get_app_info'].handler({});
  assert.equal(infoRes.isError, undefined);
  const infoJson = JSON.parse(infoRes.content[0].text);
  assert.equal(infoJson.info.versionName, '1.0.0');
  assert.equal(infoJson.info.versionCode, 10);

  // 9. install_app with valid temporary APK
  const tempDir = mkdtempSync(join(tmpdir(), 'adbmcp-tool-'));
  const tempApk = join(tempDir, 'sample.apk');
  writeFileSync(tempApk, 'FAKE_APK_CONTENT');
  const installRes = await tools['install_app'].handler({ apkPath: tempApk });
  assert.equal(installRes.isError, undefined);

  // 10. install_app with missing APK returns normalized error without throwing
  const missingInstallRes = await tools['install_app'].handler({ apkPath: '/invalid/file.apk' });
  assert.equal(missingInstallRes.isError, true);
  assert.match(missingInstallRes.content[0].text, /FILE_NOT_FOUND/);

  // 11. uninstall_app
  const uninstallRes = await tools['uninstall_app'].handler({ keepData: true });
  assert.equal(uninstallRes.isError, undefined);
  assert.match(uninstallRes.content[0].text, /Uninstalled com.example.testapp/);
});

test('MCP Phase 3 Database & SharedPreferences tool handlers execute cleanly', async () => {
  const { server, target } = createServer();
  target.setDevice('emulator-5554');
  target.setPackage('com.example.testapp');

  const tools = server._registeredTools;

  // Stub DatabaseService
  target.adb.db.getTables = async () => ['users', 'notes'];
  target.adb.db.getTableSchema = async () => [
    { cid: 0, name: 'id', type: 'INTEGER', notNull: true, defaultValue: null, primaryKey: true },
    { cid: 1, name: 'name', type: 'TEXT', notNull: true, defaultValue: null, primaryKey: false }
  ];
  target.adb.db.getDatabaseOverview = async () => [
    { tableName: 'users', rowCount: 42, columnCount: 2 },
    { tableName: 'notes', rowCount: 150, columnCount: 3 }
  ];
  target.adb.db.getTableData = async (_dev, _pkg, _db, table, opts) => ({
    tableName: table,
    columns: ['id', 'name'],
    rows: [['1', 'Alice'], ['2', 'Bob']],
    totalRows: 2,
    limit: opts.limit || 50,
    offset: opts.offset || 0,
    message: '2 rows returned',
    isQuery: true
  });
  target.adb.db.createTable = async () => 'Created table "products" in app.db';
  target.adb.db.query = async () => ({ columns: ['count'], rows: [['10']], message: '1 row returned', isQuery: true });
  target.adb.db.deleteRowsWhere = async () => 'Deleted matching row(s) from "users" in app.db';
  target.adb.db.clearTable = async () => 'Cleared all data from table "users" in app.db';
  target.adb.db.exportDatabaseFile = async () => 'Exported app.db to /tmp/app.db';

  target.adb.runner.run = async () => 'Success';

  target.adb.runner.runAdb = async (_dev, ...args) => {
    const cmd = args.join(' ');
    if (cmd.includes('/databases/')) {
      return 'app.db\nanalytics.db\n';
    }
    if (cmd.includes('ls /data/data/com.example.testapp/shared_prefs/')) {
      return 'user_session.xml\nsettings.xml\n';
    }
    if (cmd.includes('cat /data/data/com.example.testapp/shared_prefs/user_session.xml')) {
      return "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n    <string name=\"auth_token\">xyz123</string>\n    <boolean name=\"logged_in\" value=\"true\" />\n</map>";
    }
    return '';
  };

  // 1. list_databases
  const dbListRes = await tools['list_databases'].handler({});
  assert.equal(dbListRes.isError, undefined);
  assert.ok(dbListRes.content[0].text.includes('app.db'));

  // 2. inspect_database_overview
  const overviewRes = await tools['inspect_database_overview'].handler({ database: 'app.db' });
  assert.equal(overviewRes.isError, undefined);
  const overviewJson = JSON.parse(overviewRes.content[0].text);
  assert.equal(overviewJson.totalTables, 2);

  // 3. list_database_tables
  const tablesRes = await tools['list_database_tables'].handler({ database: 'app.db' });
  assert.equal(tablesRes.isError, undefined);
  assert.ok(tablesRes.content[0].text.includes('users'));

  // 4. get_table_schema
  const schemaRes = await tools['get_table_schema'].handler({ database: 'app.db', table: 'users' });
  assert.equal(schemaRes.isError, undefined);
  const schemaJson = JSON.parse(schemaRes.content[0].text);
  assert.equal(schemaJson.columns.length, 2);

  // 5. get_table_data
  const dataRes = await tools['get_table_data'].handler({ database: 'app.db', table: 'users' });
  assert.equal(dataRes.isError, undefined);
  const dataJson = JSON.parse(dataRes.content[0].text);
  assert.equal(dataJson.totalRows, 2);

  // 6. create_database_table
  const createRes = await tools['create_database_table'].handler({
    database: 'app.db',
    tableName: 'products',
    columns: [{ name: 'id', type: 'INTEGER', primaryKey: true }]
  });
  assert.equal(createRes.isError, undefined);
  assert.match(createRes.content[0].text, /Created table/);

  // 7. query_database
  const queryRes = await tools['query_database'].handler({ database: 'app.db', sql: 'SELECT COUNT(*) FROM users;' });
  assert.equal(queryRes.isError, undefined);

  // 8. delete_database_row
  const delRowRes = await tools['delete_database_row'].handler({ database: 'app.db', table: 'users', where: 'id = 5' });
  assert.equal(delRowRes.isError, undefined);
  assert.match(delRowRes.content[0].text, /Deleted matching row/);

  // 9. clear_database_table
  const clearTableRes = await tools['clear_database_table'].handler({ database: 'app.db', table: 'users' });
  assert.equal(clearTableRes.isError, undefined);
  assert.match(clearTableRes.content[0].text, /Cleared all data/);

  // 10. export_database
  const exportDbRes = await tools['export_database'].handler({ database: 'app.db', destinationPath: '/tmp/app.db' });
  assert.equal(exportDbRes.isError, undefined);
  assert.match(exportDbRes.content[0].text, /Exported/);

  // 11. list_shared_preferences
  const prefsListRes = await tools['list_shared_preferences'].handler({});
  assert.equal(prefsListRes.isError, undefined);
  assert.ok(prefsListRes.content[0].text.includes('user_session.xml'));

  // 12. read_shared_preferences
  const readPrefsRes = await tools['read_shared_preferences'].handler({ fileName: 'user_session.xml' });
  assert.equal(readPrefsRes.isError, undefined);
  const readPrefsJson = JSON.parse(readPrefsRes.content[0].text);
  assert.equal(readPrefsJson.entries['auth_token'].value, 'xyz123');

  // 13. get_shared_preference
  const getPrefRes = await tools['get_shared_preference'].handler({ fileName: 'user_session.xml', key: 'auth_token' });
  assert.equal(getPrefRes.isError, undefined);
  const getPrefJson = JSON.parse(getPrefRes.content[0].text);
  assert.equal(getPrefJson.entry.value, 'xyz123');

  // 14. clear_shared_preferences
  const clearPrefsRes = await tools['clear_shared_preferences'].handler({ fileName: 'user_session.xml' });
  assert.equal(clearPrefsRes.isError, undefined);
  assert.match(clearPrefsRes.content[0].text, /Cleared all preferences/);
});
