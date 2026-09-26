import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSharedPreferencesXml,
  serializeSharedPreferencesXml,
  inferPrefType,
  DatabaseService
} from '../out/index.js';

const SAMPLE_PREFS_XML = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="user_name">John &amp; Jane</string>
    <boolean name="is_logged_in" value="true" />
    <int name="login_count" value="42" />
    <long name="timestamp" value="1700000000000" />
    <float name="rating" value="4.5" />
    <set name="tags">
        <string>admin</string>
        <string>beta_tester</string>
    </set>
</map>`;

test('parseSharedPreferencesXml parses all supported Android preference types', () => {
  const prefs = parseSharedPreferencesXml(SAMPLE_PREFS_XML);

  assert.deepEqual(prefs['user_name'], { key: 'user_name', type: 'string', value: 'John & Jane' });
  assert.deepEqual(prefs['is_logged_in'], { key: 'is_logged_in', type: 'boolean', value: true });
  assert.deepEqual(prefs['login_count'], { key: 'login_count', type: 'int', value: 42 });
  assert.deepEqual(prefs['timestamp'], { key: 'timestamp', type: 'long', value: '1700000000000' });
  assert.deepEqual(prefs['rating'], { key: 'rating', type: 'float', value: 4.5 });
  assert.deepEqual(prefs['tags'], { key: 'tags', type: 'set', value: ['admin', 'beta_tester'] });
});

test('serializeSharedPreferencesXml round-trips with parseSharedPreferencesXml', () => {
  const original = parseSharedPreferencesXml(SAMPLE_PREFS_XML);
  const serialized = serializeSharedPreferencesXml(original);
  const parsedAgain = parseSharedPreferencesXml(serialized);

  assert.deepEqual(parsedAgain, original);
});

test('inferPrefType detects type accurately', () => {
  assert.equal(inferPrefType('hello'), 'string');
  assert.equal(inferPrefType(true), 'boolean');
  assert.equal(inferPrefType(10), 'int');
  assert.equal(inferPrefType(10.5), 'float');
  assert.equal(inferPrefType(['tag1', 'tag2']), 'set');
});

test('DatabaseService constructs schema and DDL queries accurately', async () => {
  const recordedQueries = [];
  const dbService = new DatabaseService({});

  // Stub query method directly
  dbService.query = async (_deviceId, _pkg, _dbName, sql) => {
    recordedQueries.push(sql);
    if (sql.includes('PRAGMA table_info')) {
      return {
        columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
        rows: [
          ['0', 'id', 'INTEGER', '1', 'NULL', '1'],
          ['1', 'title', 'TEXT', '1', 'NULL', '0'],
          ['2', 'views', 'INTEGER', '0', '0', '0']
        ],
        isQuery: true
      };
    }
    if (sql.includes('sqlite_master')) {
      return {
        columns: ['name'],
        rows: [['users'], ['posts']],
        isQuery: true
      };
    }
    if (sql.includes('SELECT COUNT(*)')) {
      return {
        columns: ['total'],
        rows: [['128']],
        isQuery: true
      };
    }
    if (sql.includes('SELECT * FROM "posts"')) {
      return {
        columns: ['id', 'title'],
        rows: [['1', 'First Post'], ['2', 'Second Post']],
        isQuery: true
      };
    }
    return { columns: [], rows: [], message: 'Success', isQuery: false };
  };

  // 1. getTableSchema
  const schema = await dbService.getTableSchema('dev1', 'com.app', 'main.db', 'users');
  assert.equal(schema.length, 3);
  assert.equal(schema[0].name, 'id');
  assert.equal(schema[0].primaryKey, true);
  assert.equal(schema[1].name, 'title');
  assert.equal(schema[1].notNull, true);

  // 2. getTableData
  const tableData = await dbService.getTableData('dev1', 'com.app', 'main.db', 'posts', { limit: 10, offset: 0 });
  assert.equal(tableData.totalRows, 128);
  assert.equal(tableData.rows.length, 2);

  // 3. getDatabaseOverview
  const overview = await dbService.getDatabaseOverview('dev1', 'com.app', 'main.db');
  assert.equal(overview.length, 2);
  assert.equal(overview[0].tableName, 'users');
  assert.equal(overview[0].rowCount, 128);

  // 4. createTable
  await dbService.createTable('dev1', 'com.app', 'main.db', {
    tableName: 'categories',
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
      { name: 'name', type: 'TEXT', notNull: true, defaultValue: 'General' }
    ]
  });
  const createSql = recordedQueries.find(q => q.includes('CREATE TABLE'));
  assert.ok(createSql);
  assert.match(createSql, /"id" INTEGER PRIMARY KEY AUTOINCREMENT/);
  assert.match(createSql, /"name" TEXT NOT NULL DEFAULT 'General'/);

  // 5. deleteRowsWhere
  await dbService.deleteRowsWhere('dev1', 'com.app', 'main.db', 'users', 'id = 5');
  const deleteSql = recordedQueries.find(q => q.includes('DELETE FROM "users" WHERE id = 5'));
  assert.ok(deleteSql);

  // 6. clearTable
  await dbService.clearTable('dev1', 'com.app', 'main.db', 'users', true);
  const clearSql = recordedQueries.find(q => q.includes('DELETE FROM sqlite_sequence WHERE name = \'users\''));
  assert.ok(clearSql);
});
