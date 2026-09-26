import { z } from 'zod';
import { getDatabaseFiles } from '@samsadch/adb-core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, jsonResult, textResult } from '../result.js';
import { TargetStore } from '../targetStore.js';

/**
 * Registers SQLite database exploration, schema inspection, and querying tools.
 */
export function registerDatabaseTools(server: McpServer, target: TargetStore): void {
  server.registerTool(
    'list_databases',
    {
      title: 'List application SQLite databases',
      description: 'Lists all SQLite database files located inside the application sandbox (`/data/data/<pkg>/databases/`).',
      inputSchema: {
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('list_databases', async ({ packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const dbs = await getDatabaseFiles(target.adb.runner, dev, pkg);
      return jsonResult({ databases: dbs, total: dbs.length, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'inspect_database_overview',
    {
      title: 'Inspect database overview table',
      description:
        'Generates an inventory table summarizing all tables in the database with their row counts and column counts.',
      inputSchema: {
        database: z.string().describe('SQLite database file name (e.g. "app.db" or "users_database").'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('inspect_database_overview', async ({ database, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const overview = await target.adb.db.getDatabaseOverview(dev, pkg, database);
      return jsonResult({ database, tables: overview, totalTables: overview.length, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'list_database_tables',
    {
      title: 'List tables in a database',
      description: 'Lists all user tables defined inside the specified SQLite database.',
      inputSchema: {
        database: z.string().describe('SQLite database file name.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('list_database_tables', async ({ database, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const tables = await target.adb.db.getTables(dev, pkg, database);
      return jsonResult({ database, tables, total: tables.length, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'get_table_schema',
    {
      title: 'Get table column definitions & schema',
      description: 'Inspects column names, data types, nullability, default values, and primary key flags for a specific table.',
      inputSchema: {
        database: z.string().describe('SQLite database file name.'),
        table: z.string().describe('Table name to inspect.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('get_table_schema', async ({ database, table, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const columns = await target.adb.db.getTableSchema(dev, pkg, database, table);
      return jsonResult({ database, table, columns, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'get_table_data',
    {
      title: 'Browse table rows with pagination',
      description: 'Fetches rows, columns, and total row count from a table with pagination (`limit` and `offset`) and sorting support.',
      inputSchema: {
        database: z.string().describe('SQLite database file name.'),
        table: z.string().describe('Table name to browse.'),
        limit: z.number().optional().default(50).describe('Maximum number of rows to return (default 50).'),
        offset: z.number().optional().default(0).describe('Row offset for pagination (default 0).'),
        orderBy: z.string().optional().describe('Optional ORDER BY clause (e.g. "id DESC" or "created_at ASC").'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('get_table_data', async ({ database, table, limit, offset, orderBy, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const result = await target.adb.db.getTableData(dev, pkg, database, table, {
        limit: limit ?? 50,
        offset: offset ?? 0,
        orderBy
      });
      return jsonResult({ ...result, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'create_database_table',
    {
      title: 'Create a new table in database',
      description: 'Creates a new SQLite table with structured column definitions or raw SQL DDL.',
      inputSchema: {
        database: z.string().describe('SQLite database file name.'),
        tableName: z.string().describe('Table name to create.'),
        columns: z
          .array(
            z.object({
              name: z.string().describe('Column name.'),
              type: z.string().describe('SQLite data type (e.g. "INTEGER", "TEXT", "REAL", "BLOB").'),
              primaryKey: z.boolean().optional().describe('Is this column the primary key?'),
              autoIncrement: z.boolean().optional().describe('Auto-increment integer primary key?'),
              notNull: z.boolean().optional().describe('Disallow NULL values?'),
              defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional().describe('Default column value.')
            })
          )
          .optional()
          .describe('List of column definitions.'),
        rawSql: z.string().optional().describe('Raw CREATE TABLE SQL statement (overrides columns if provided).'),
        ifNotExists: z.boolean().optional().default(true).describe('Add IF NOT EXISTS clause (default true).'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('create_database_table', async ({ database, tableName, columns, rawSql, ifNotExists, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const out = await target.adb.db.createTable(dev, pkg, database, {
        tableName,
        columns,
        rawSql,
        ifNotExists: ifNotExists ?? true
      });
      return textResult(out);
    })
  );

  server.registerTool(
    'query_database',
    {
      title: 'Execute SQL query on database',
      description:
        'Runs an arbitrary SQL query (SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, etc.) against an app database. ' +
        'SELECT queries return structured JSON columns and rows.',
      inputSchema: {
        database: z.string().describe('SQLite database file name.'),
        sql: z.string().describe('SQL statement to execute.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('query_database', async ({ database, sql, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const result = await target.adb.db.query(dev, pkg, database, sql);
      return jsonResult({ database, ...result, package: pkg, device: dev });
    })
  );

  server.registerTool(
    'delete_database_row',
    {
      title: 'Delete specific row(s) from a table',
      description: 'Deletes matching row(s) from a table using a WHERE filter condition.',
      inputSchema: {
        database: z.string().describe('SQLite database file name.'),
        table: z.string().describe('Table name to delete from.'),
        where: z.string().describe('WHERE filter condition clause (e.g. "id = 42" or "status = \'archived\'").'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('delete_database_row', async ({ database, table, where, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const out = await target.adb.db.deleteRowsWhere(dev, pkg, database, table, where);
      return textResult(out);
    })
  );

  server.registerTool(
    'clear_database_table',
    {
      title: 'Clear all data from a table (truncate)',
      description: 'Wipes all records from a table (`DELETE FROM <table>;`) and optionally resets its SQLite auto-increment sequence.',
      inputSchema: {
        database: z.string().describe('SQLite database file name.'),
        table: z.string().describe('Table name to clear.'),
        resetAutoIncrement: z.boolean().optional().default(true).describe('Reset auto-increment ID counter (default true).'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
    },
    guard('clear_database_table', async ({ database, table, resetAutoIncrement, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const out = await target.adb.db.clearTable(dev, pkg, database, table, resetAutoIncrement ?? true);
      return textResult(out);
    })
  );

  server.registerTool(
    'export_database',
    {
      title: 'Export database file to host',
      description: 'Downloads/exports a copy of the SQLite database (merging WAL journals) to a local host destination file path.',
      inputSchema: {
        database: z.string().describe('SQLite database file name on device.'),
        destinationPath: z.string().describe('Local absolute filesystem destination file path on the host machine.'),
        packageName: z.string().optional().describe('Package applicationId. Defaults to sticky target package.'),
        device: z.string().optional().describe('Device id. Defaults to sticky target device.')
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    guard('export_database', async ({ database, destinationPath, packageName, device }) => {
      const dev = device ?? (await target.resolveDevice());
      const pkg = packageName ?? (await target.resolvePackage());
      const out = await target.adb.db.exportDatabaseFile(dev, pkg, database, destinationPath);
      return textResult(out);
    })
  );
}
