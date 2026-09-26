import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getSqliteCandidates } from './adbPath';
import { AdbRunner } from './exec';
import { AdbConfig, SqlQueryResult, TRANSFER_TIMEOUT_MS } from './types';

const READ_ONLY_SQL = /^(SELECT|PRAGMA|EXPLAIN|WITH)/i;

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
}

export interface TableOverview {
  tableName: string;
  rowCount: number;
  columnCount: number;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  notNull?: boolean;
  defaultValue?: string | number | boolean;
}

export interface CreateTableOptions {
  tableName: string;
  columns?: ColumnDefinition[];
  rawSql?: string;
  ifNotExists?: boolean;
}

export interface TableDataResult extends SqlQueryResult {
  tableName: string;
  totalRows: number;
  limit: number;
  offset: number;
}

/**
 * Reads and writes an app's SQLite databases.
 *
 * Android stopped shipping the `sqlite3` binary in user builds (API 28+), so querying on the
 * device is not an option on real hardware. Instead the database is copied to the host with
 * `run-as cat`, queried with the host's sqlite3, and pushed back when a statement writes.
 */
export class DatabaseService {
  private sqlitePath: string | null = null;

  constructor(
    private readonly adb: AdbRunner,
    private readonly config: AdbConfig = {}
  ) {}

  public async getTables(deviceId: string, pkg: string, dbName: string): Promise<string[]> {
    const res = await this.query(
      deviceId,
      pkg,
      dbName,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' " +
        "AND name NOT LIKE 'android_metadata' AND name NOT LIKE 'room_master_table' ORDER BY name;"
    );
    return res.rows.map(r => r[0]).filter(Boolean);
  }

  public async getTableSchema(
    deviceId: string,
    pkg: string,
    dbName: string,
    tableName: string
  ): Promise<ColumnInfo[]> {
    const res = await this.query(deviceId, pkg, dbName, `PRAGMA table_info("${esc(tableName)}");`);
    // PRAGMA table_info returns columns: cid, name, type, notnull, dflt_value, pk
    return res.rows.map(row => {
      const cid = parseInt(row[0], 10) || 0;
      const name = row[1];
      const type = row[2];
      const notNull = row[3] === '1';
      const defaultValue = row[4] === 'NULL' ? null : row[4];
      const primaryKey = row[5] === '1';
      return { cid, name, type, notNull, defaultValue, primaryKey };
    });
  }

  public async getDatabaseOverview(
    deviceId: string,
    pkg: string,
    dbName: string
  ): Promise<TableOverview[]> {
    const tables = await this.getTables(deviceId, pkg, dbName);
    const overview: TableOverview[] = [];

    for (const table of tables) {
      try {
        const countRes = await this.query(
          deviceId,
          pkg,
          dbName,
          `SELECT COUNT(*) AS total FROM "${esc(table)}";`
        );
        const rowCount = countRes.rows.length > 0 ? parseInt(countRes.rows[0][0], 10) || 0 : 0;
        const schema = await this.getTableSchema(deviceId, pkg, dbName, table);
        overview.push({
          tableName: table,
          rowCount,
          columnCount: schema.length
        });
      } catch {
        overview.push({
          tableName: table,
          rowCount: 0,
          columnCount: 0
        });
      }
    }

    return overview;
  }

  public async getTableData(
    deviceId: string,
    pkg: string,
    dbName: string,
    tableName: string,
    options: { limit?: number; offset?: number; orderBy?: string } = {}
  ): Promise<TableDataResult> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const countRes = await this.query(
      deviceId,
      pkg,
      dbName,
      `SELECT COUNT(*) AS total FROM "${esc(tableName)}";`
    );
    const totalRows = countRes.rows.length > 0 ? parseInt(countRes.rows[0][0], 10) || 0 : 0;

    let sql = `SELECT * FROM "${esc(tableName)}"`;
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset};`;

    const dataRes = await this.query(deviceId, pkg, dbName, sql);

    return {
      tableName,
      columns: dataRes.columns,
      rows: dataRes.rows,
      totalRows,
      limit,
      offset,
      message: `${dataRes.rows.length} row(s) returned (total: ${totalRows})`,
      isQuery: true
    };
  }

  public async createTable(
    deviceId: string,
    pkg: string,
    dbName: string,
    options: CreateTableOptions
  ): Promise<string> {
    if (options.rawSql) {
      await this.query(deviceId, pkg, dbName, options.rawSql);
      return `Created table in ${dbName}`;
    }

    if (!options.tableName || !options.columns || options.columns.length === 0) {
      throw new Error('Either rawSql or tableName with columns must be provided.');
    }

    const ifNotExists = options.ifNotExists !== false ? 'IF NOT EXISTS ' : '';
    const columnClauses = options.columns.map(col => {
      let clause = `"${esc(col.name)}" ${col.type}`;
      if (col.primaryKey) {
        clause += ' PRIMARY KEY';
        if (col.autoIncrement) {
          clause += ' AUTOINCREMENT';
        }
      }
      if (col.notNull && !col.primaryKey) {
        clause += ' NOT NULL';
      }
      if (col.defaultValue !== undefined) {
        if (typeof col.defaultValue === 'string') {
          clause += ` DEFAULT '${lit(col.defaultValue)}'`;
        } else {
          clause += ` DEFAULT ${col.defaultValue}`;
        }
      }
      return clause;
    });

    const sql = `CREATE TABLE ${ifNotExists}"${esc(options.tableName)}" (\n  ${columnClauses.join(',\n  ')}\n);`;
    await this.query(deviceId, pkg, dbName, sql);
    return `Created table "${options.tableName}" in ${dbName}`;
  }

  public async deleteRowsWhere(
    deviceId: string,
    pkg: string,
    dbName: string,
    tableName: string,
    whereClause: string
  ): Promise<string> {
    const trimmed = whereClause.trim();
    if (!trimmed) {
      throw new Error('A WHERE clause must be provided to delete matching rows. To delete all rows, use clearTable.');
    }
    const sql = `DELETE FROM "${esc(tableName)}" WHERE ${trimmed};`;
    await this.query(deviceId, pkg, dbName, sql);
    return `Deleted matching row(s) from "${tableName}" in ${dbName}`;
  }

  public async clearTable(
    deviceId: string,
    pkg: string,
    dbName: string,
    tableName: string,
    resetAutoIncrement = true
  ): Promise<string> {
    let sql = `DELETE FROM "${esc(tableName)}";`;
    if (resetAutoIncrement) {
      sql += `\nDELETE FROM sqlite_sequence WHERE name = '${lit(tableName)}';`;
    }
    await this.query(deviceId, pkg, dbName, sql);
    return `Cleared all data from table "${tableName}" in ${dbName}`;
  }

  public async exportDatabaseFile(
    deviceId: string,
    pkg: string,
    dbName: string,
    destinationPath: string
  ): Promise<string> {
    const localDb = await this.ensureLocalCopy(deviceId, pkg, dbName, true);
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.promises.copyFile(localDb, destinationPath);
    return `Exported ${dbName} to ${destinationPath}`;
  }

  public async query(deviceId: string, pkg: string, dbName: string, sql: string): Promise<SqlQueryResult> {
    const trimmed = sql.trim();
    const isRead = READ_ONLY_SQL.test(trimmed);
    const localDb = await this.ensureLocalCopy(deviceId, pkg, dbName, isRead);
    const sqlite = await this.resolveSqlite();

    if (isRead) {
      // -json survives values containing newlines, quotes and separators; a delimiter cannot.
      return this.parseJson(await this.exec(sqlite, ['-json', localDb, trimmed]));
    }

    const output = await this.exec(sqlite, [localDb, trimmed]);
    await this.push(deviceId, pkg, dbName);
    return { columns: [], rows: [], message: output.trim() || 'Query executed successfully', isQuery: false };
  }

  public async updateCell(
    deviceId: string, pkg: string, dbName: string, tableName: string,
    pkCol: string, pkVal: string, targetCol: string, newVal: string
  ): Promise<string> {
    const sql = `UPDATE "${esc(tableName)}" SET "${esc(targetCol)}" = '${lit(newVal)}' ` +
      `WHERE "${esc(pkCol)}" = '${lit(pkVal)}';`;
    await this.query(deviceId, pkg, dbName, sql);
    return `Updated "${targetCol}" in "${tableName}"`;
  }

  public async deleteRow(
    deviceId: string, pkg: string, dbName: string, tableName: string, pkCol: string, pkVal: string
  ): Promise<string> {
    const sql = `DELETE FROM "${esc(tableName)}" WHERE "${esc(pkCol)}" = '${lit(pkVal)}';`;
    await this.query(deviceId, pkg, dbName, sql);
    return `Deleted row from "${tableName}"`;
  }

  /** Copies the database (and its WAL) off the device so the host can read it. */
  public async sync(deviceId: string, pkg: string, dbName: string): Promise<string> {
    const dir = this.localDir(deviceId, pkg);
    fs.mkdirSync(dir, { recursive: true });
    const localDb = path.join(dir, dbName);
    const remote = this.remotePath(pkg, dbName);

    await this.pull(deviceId, pkg, remote, localDb);
    if (!fs.existsSync(localDb) || fs.statSync(localDb).size === 0) {
      throw new Error(`Could not read '${dbName}'. The app must be debuggable for run-as to work.`);
    }

    // Recent writes may live only in the WAL, so the main file alone can be stale.
    const localWal = `${localDb}-wal`;
    await this.pull(deviceId, pkg, `${remote}-wal`, localWal).catch(() => undefined);
    if (fs.existsSync(localWal) && fs.statSync(localWal).size === 0) {
      fs.unlinkSync(localWal);
    }
    // A leftover -shm would not match the WAL we just pulled; SQLite rebuilds it on open.
    const localShm = `${localDb}-shm`;
    if (fs.existsSync(localShm)) {
      fs.unlinkSync(localShm);
    }
    return localDb;
  }

  /** Folds the local WAL back in and writes the database to the device. */
  public async push(deviceId: string, pkg: string, dbName: string): Promise<void> {
    const localDb = path.join(this.localDir(deviceId, pkg), dbName);
    if (!fs.existsSync(localDb)) {
      throw new Error(`No local copy of '${dbName}' to push.`);
    }
    const sqlite = await this.resolveSqlite();
    await this.exec(sqlite, [localDb, 'PRAGMA wal_checkpoint(TRUNCATE);']).catch(() => undefined);

    const adbBin = await this.adb.resolveAdbBinary();
    const remote = this.remotePath(pkg, dbName);
    await new Promise<void>((resolve, reject) => {
      // adb joins argv into one command line without quoting, so a bare `>` would be
      // redirected by the device's outer shell (uid shell, which cannot write to
      // /data/data). Sending one pre-quoted string keeps the redirect inside run-as.
      const proc = spawn(
        adbBin,
        ['-s', deviceId, 'shell', `run-as ${pkg} sh -c 'cat > "${remote}"'`],
        { env: this.adb.getEnv() }
      );
      let err = '';
      proc.stderr.on('data', d => { err += d.toString(); });
      proc.on('error', reject);
      proc.on('close', code => {
        if (code === 0) { resolve(); } else { reject(new Error(err.trim() || `Push failed (exit ${code})`)); }
      });
      fs.createReadStream(localDb).pipe(proc.stdin);
    });

    // The device's WAL/SHM predate the file we just pushed and would resurrect the old pages.
    await this.adb.run(
      deviceId, ['shell', 'run-as', pkg, 'rm', '-f', `${remote}-wal`, `${remote}-shm`]
    ).catch(() => undefined);
  }

  private async ensureLocalCopy(deviceId: string, pkg: string, dbName: string, fresh: boolean): Promise<string> {
    const localDb = path.join(this.localDir(deviceId, pkg), dbName);
    if (fresh || !fs.existsSync(localDb)) {
      return this.sync(deviceId, pkg, dbName);
    }
    return localDb;
  }

  private pull(deviceId: string, pkg: string, remotePath: string, localPath: string): Promise<void> {
    return this.adb.resolveAdbBinary().then(adbBin => new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(localPath);
      // exec-out keeps the stream binary-clean; `adb shell` would mangle it with CRLF translation.
      const proc = spawn(
        adbBin,
        ['-s', deviceId, 'exec-out', 'run-as', pkg, 'cat', remotePath],
        { env: this.adb.getEnv() }
      );
      let err = '';
      proc.stderr.on('data', d => { err += d.toString(); });
      proc.on('error', reject);
      out.on('error', reject);
      out.on('close', () => {
        const size = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0;
        if (size === 0 && err.trim()) { reject(new Error(err.trim())); } else { resolve(); }
      });
      proc.stdout.pipe(out);
    }));
  }

  private parseJson(output: string): SqlQueryResult {
    const text = output.trim();
    if (!text) {
      return { columns: [], rows: [], message: '0 rows returned', isQuery: true };
    }
    let parsed: Record<string, unknown>[];
    try {
      parsed = JSON.parse(text);
    } catch {
      return { columns: [], rows: [], message: text, isQuery: false };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { columns: [], rows: [], message: '0 rows returned', isQuery: true };
    }
    const columns = Object.keys(parsed[0]);
    const rows = parsed.map(r => columns.map(c => (r[c] === null || r[c] === undefined ? 'NULL' : String(r[c]))));
    return { columns, rows, message: `${rows.length} row(s) returned`, isQuery: true };
  }

  private async resolveSqlite(): Promise<string> {
    if (this.sqlitePath) {
      return this.sqlitePath;
    }
    for (const bin of getSqliteCandidates(this.config)) {
      try {
        await this.exec(bin, ['-version']);
        this.sqlitePath = bin;
        return bin;
      } catch { /* try the next candidate */ }
    }
    throw new Error(
      'sqlite3 not found on this machine. Install it (macOS: brew install sqlite, ' +
      'Linux: apt install sqlite3, Windows: sqlite.org/download.html) or configure sqlitePath.'
    );
  }

  private exec(bin: string, args: string[]): Promise<string> {
    // execFile passes argv directly, so separators and SQL never go through a shell.
    return new Promise((resolve, reject) => {
      execFile(bin, args, { env: this.adb.getEnv(), maxBuffer: 64 * 1024 * 1024, timeout: TRANSFER_TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error) { reject(new Error((stderr || stdout || error.message).trim())); } else { resolve(stdout); }
        });
    });
  }

  private localDir(deviceId: string, pkg: string): string {
    const safeDevice = deviceId.replace(/[:/\\]/g, '_');
    return path.join(os.tmpdir(), 'samsad_adb_dbs', safeDevice, pkg);
  }

  private remotePath(pkg: string, dbName: string): string {
    // These are interpolated into a quoted device-shell command, so anything that could
    // close the quoting is rejected rather than escaped.
    for (const part of [pkg, dbName]) {
      if (!/^[A-Za-z0-9._-]+$/.test(part)) {
        throw new Error(`Unsupported name for a device path: '${part}'`);
      }
    }
    return `/data/data/${pkg}/databases/${dbName}`;
  }
}

/** Escapes a double-quoted SQLite identifier. */
function esc(identifier: string): string {
  return identifier.replace(/"/g, '""');
}

/** Escapes a single-quoted SQLite string literal. */
function lit(value: string): string {
  return value.replace(/'/g, "''");
}
