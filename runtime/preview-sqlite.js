import { dartInvocation, invokeDart } from './dart-environment.js';
const named = (fn) => Object.assign((...args) => fn(args, {}), { [dartInvocation]: fn });
const quote = (name) => {
  if (typeof name !== 'string' || !name || name.includes('\0'))
    throw Error('Invalid SQL identifier.');
  return '"' + name.replaceAll('"', '""') + '"';
};
const record = (values) => {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw Error('SQL values must be a map.');
  return Object.entries(values);
};
const number = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw Error(`${label} must be a non-negative integer.`);
  return value;
};
export class PreviewSqlite {
  constructor(services, path) {
    this.services = services;
    this.path = path;
    this.key = `sqlite:${path}`;
    this.engine = null;
    this.closed = false;
    this.foreignKeys = false;
  }
  check() {
    this.services.check();
    if (this.closed) throw Error('SQLite database is closed.');
  }
  async open(options) {
    this.check();
    if (!this.services.sqliteFactory) throw Error('SQLite is unavailable in this preview host.');
    if (!Number.isSafeInteger(options.version) || options.version < 1)
      throw Error('SQLite version must be at least 1.');
    this.engine = await this.services.sqliteFactory();
    const api = this.api();
    try {
      this.check();
      await this.services.backend.lock(this.key, async () => {
        this.check();
        const saved = await this.services.backend.get(this.key);
        await this.engine.load(saved);
        const direct = this.api(true);
        await options.onConfigure?.(direct);
        this.foreignKeys = !!(await this.engine.run('PRAGMA foreign_keys')).rows[0]?.foreign_keys;
        const previous = (await this.engine.run('PRAGMA user_version')).rows[0]?.user_version || 0;
        if (previous > options.version)
          throw Error('SQLite schema downgrade requires an explicit migration.');
        if (previous !== options.version) {
          await this.engine.run('BEGIN IMMEDIATE');
          try {
            if (!previous) await options.onCreate?.(direct, options.version);
            else await options.onUpgrade?.(direct, previous, options.version);
            this.check();
            await this.engine.run(`PRAGMA user_version = ${options.version}`);
            await this.engine.run('COMMIT');
            await this.services.backend.put(this.key, await this.engine.export());
          } catch (error) {
            try {
              await this.engine.run('ROLLBACK');
            } catch {}
            throw error;
          }
        }
      });
      return api;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  async atomic(action, persist) {
    this.check();
    return this.services.backend.lock(this.key, async () => {
      this.check();
      await this.engine.load(await this.services.backend.get(this.key));
      await this.engine.run(`PRAGMA foreign_keys = ${this.foreignKeys ? 1 : 0}`);
      await this.engine.run('BEGIN IMMEDIATE');
      try {
        const result = await action();
        this.check();
        await this.engine.run('COMMIT');
        if (persist) await this.services.backend.put(this.key, await this.engine.export());
        return result;
      } catch (error) {
        try {
          await this.engine.run('ROLLBACK');
        } catch {}
        throw error;
      }
    });
  }
  api(direct = false) {
    const connection = this;
    const run = async (sql, args = []) => {
      connection.check();
      if (typeof sql !== 'string') throw Error('SQL must be text.');
      if (
        /\b(?:ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(
          sql.replace(/'([^']|'')*'/g, "''"),
        )
      )
        throw Error(
          'Use the transaction API for preview SQL transactions. Attached databases are unavailable.',
        );
      const result = await connection.engine.run(sql, args ?? []);
      result.rows = result.rows.map((row) => Object.assign(Object.create(null), row));
      return result;
    };
    const execute = (fn, persist = true) => (direct ? fn() : connection.atomic(fn, persist));
    const where = (props) => (props.where ? ` WHERE ${props.where}` : '');
    const conflict = (props) => {
      if (!props.conflictAlgorithm) return '';
      const name = props.conflictAlgorithm.symbol?.split('.').at(-1);
      if (!['rollback', 'abort', 'fail', 'ignore', 'replace'].includes(name))
        throw Error('Invalid SQL conflict algorithm.');
      return ` OR ${name.toUpperCase()}`;
    };
    const api = {
      get path() {
        return direct ? '' : connection.path;
      },
      get isOpen() {
        return !connection.closed && !connection.services.disposed;
      },
      execute: (sql, args) =>
        execute(async () => {
          await run(sql, args);
          return null;
        }),
      rawQuery: (sql, args) => execute(async () => (await run(sql, args)).rows),
      rawInsert: (sql, args) => execute(async () => (await run(sql, args)).id),
      rawUpdate: (sql, args) => execute(async () => (await run(sql, args)).changes),
      rawDelete: (sql, args) => execute(async () => (await run(sql, args)).changes),
      query: named(([table], props) =>
        execute(async () => {
          let sql = `SELECT ${props.distinct ? 'DISTINCT ' : ''}${props.columns?.length ? props.columns.map(quote).join(', ') : '*'} FROM ${quote(table)}${where(props)}`;
          for (const [key, label] of [
            ['groupBy', 'GROUP BY'],
            ['having', 'HAVING'],
            ['orderBy', 'ORDER BY'],
          ])
            if (props[key]) sql += ` ${label} ${props[key]}`;
          if (props.limit != null) sql += ` LIMIT ${number(props.limit, 'limit')}`;
          if (props.offset != null) {
            if (props.limit == null) sql += ' LIMIT -1';
            sql += ` OFFSET ${number(props.offset, 'offset')}`;
          }
          return (await run(sql, props.whereArgs)).rows;
        }, false),
      ),
      insert: named(([table, values], props) =>
        execute(async () => {
          const entries = record(values);
          const sql = entries.length
            ? `INSERT${conflict(props)} INTO ${quote(table)} (${entries.map(([key]) => quote(key)).join(',')}) VALUES (${entries.map(() => '?').join(',')})`
            : `INSERT${conflict(props)} INTO ${quote(table)} DEFAULT VALUES`;
          return (
            await run(
              sql,
              entries.map(([, value]) => value),
            )
          ).id;
        }),
      ),
      update: named(([table, values], props) =>
        execute(async () => {
          const entries = record(values);
          if (!entries.length) throw Error('Provide at least one value to update.');
          return (
            await run(
              `UPDATE${conflict(props)} ${quote(table)} SET ${entries.map(([key]) => quote(key) + ' = ?').join(', ')}${where(props)}`,
              [...entries.map(([, value]) => value), ...(props.whereArgs || [])],
            )
          ).changes;
        }),
      ),
      delete: named(([table], props) =>
        execute(
          async () =>
            (await run(`DELETE FROM ${quote(table)}${where(props)}`, props.whereArgs)).changes,
        ),
      ),
      transaction: (action) => {
        if (direct) throw Error('Nested SQLite transactions are unsupported.');
        return connection.atomic(() => invokeDart(action, [connection.api(true)]), true);
      },
      close: async () => {
        if (direct) throw Error('Close the database outside a transaction.');
        await connection.services.backend.lock(connection.key, () => connection.close());
      },
    };
    return api;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.engine?.close();
  }
}
