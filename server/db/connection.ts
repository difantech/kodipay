/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;

// Global singleton handles to support both Serverless and Long-running dev servers
declare global {
  var _pgliteInstance: PGlite | undefined;
  var _pgliteInitPromise: Promise<PGlite> | undefined;
  var _neonPool: pg.Pool | undefined;
}

/**
 * Check whether Neon / external PostgreSQL DATABASE_URL is configured
 */
export function isNeonConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));
}

/**
 * Return singleton connection pool for Neon Serverless PostgreSQL
 */
export function getNeonPool(): pg.Pool {
  if (global._neonPool) {
    return global._neonPool;
  }

  const connectionString = process.env.DATABASE_URL!;
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  global._neonPool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: process.env.NODE_ENV === 'production' ? 20 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  global._neonPool.on('error', (err) => {
    console.error('Unexpected error on idle Neon PostgreSQL client:', err.message);
  });

  return global._neonPool;
}

export function getDatabasePath(): string {
  const customPath = process.env.DATABASE_PATH || './data/postgres';
  const resolved = path.resolve(process.cwd(), customPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

function cleanStaleLocks(dbPath: string) {
  try {
    const lockFiles = ['postmaster.pid', 'postmaster.opts', '.s.PGSQL.5432.lock'];
    for (const f of lockFiles) {
      const p = path.join(dbPath, f);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore
  }
}

async function initializePGliteInstance(): Promise<PGlite> {
  const dbPath = getDatabasePath();

  try {
    cleanStaleLocks(dbPath);
    const instance = new PGlite(dbPath);
    await instance.waitReady;
    global._pgliteInstance = instance;
    return instance;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('Failed to initialize local filesystem database at', dbPath, ':', errMsg);
    console.warn('Re-initializing clean database directory to recover from lock/abort...');

    try {
      if (fs.existsSync(dbPath)) {
        cleanStaleLocks(dbPath);
        const backupPath = `${dbPath}.recovering.${Date.now()}`;
        try {
          fs.renameSync(dbPath, backupPath);
        } catch {
          fs.rmSync(dbPath, { recursive: true, force: true });
        }
        fs.mkdirSync(dbPath, { recursive: true });
      }

      const recoveredInstance = new PGlite(dbPath);
      await recoveredInstance.waitReady;
      global._pgliteInstance = recoveredInstance;

      const { runMigrations } = await import('./schema.ts');
      await runMigrations();
      return recoveredInstance;
    } catch (fallbackErr: any) {
      console.error('Filesystem database recovery failed, falling back to memory database:', fallbackErr);
      const memInstance = new PGlite();
      await memInstance.waitReady;
      global._pgliteInstance = memInstance;

      const { runMigrations } = await import('./schema.ts');
      await runMigrations();
      return memInstance;
    }
  }
}

/**
 * Get active database engine (Neon Pool or local PGlite)
 */
export async function getDb(): Promise<any> {
  if (isNeonConfigured()) {
    return getNeonPool();
  }

  if (global._pgliteInstance) {
    return global._pgliteInstance;
  }

  if (global._pgliteInitPromise) {
    return global._pgliteInitPromise;
  }

  global._pgliteInitPromise = initializePGliteInstance();

  try {
    const instance = await global._pgliteInitPromise;
    return instance;
  } catch (err) {
    global._pgliteInstance = undefined;
    global._pgliteInitPromise = undefined;
    throw err;
  } finally {
    global._pgliteInitPromise = undefined;
  }
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

/**
 * Execute parameterized query on Neon PostgreSQL or local PGlite with automatic error categorization
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  try {
    if (isNeonConfigured()) {
      const pool = getNeonPool();
      const res = await pool.query(sql, params);
      return {
        rows: res.rows as T[],
        rowCount: res.rowCount ?? res.rows.length
      };
    }

    const db = await getDb();
    const res = await (db.query as any)(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rows.length
    };
  } catch (error: any) {
    const msg = error?.message || String(error);

    const isExpectedConstraint =
      msg.includes('duplicate key') ||
      msg.includes('unique constraint') ||
      msg.includes('violates foreign key') ||
      msg.includes('violates check constraint');

    if (!isExpectedConstraint) {
      console.error('PostgreSQL query error:', msg, '\nQuery:', sql, '\nParams:', params);
    } else {
      console.warn('PostgreSQL constraint condition:', msg);
    }

    if (msg.includes('Aborted') || msg.includes('closed') || msg.includes('dead')) {
      console.warn('PostgreSQL connection dropped; clearing singleton instance for reconnection.');
      global._pgliteInstance = undefined;
      global._pgliteInitPromise = undefined;
      global._neonPool = undefined;
    }

    throw error;
  }
}

export interface TxDb {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[]; rowCount?: number }>;
  exec: (sql: string) => Promise<any>;
}

/**
 * Transaction helper executing callback in BEGIN ... COMMIT / ROLLBACK across Neon or PGlite
 */
export async function transaction<T>(callback: (db: TxDb) => Promise<T>): Promise<T> {
  if (isNeonConfigured()) {
    const pool = getNeonPool();
    const client = await pool.connect();
    await client.query('BEGIN');
    try {
      const txDb: TxDb = {
        query: async <R = any>(sql: string, params?: any[]) => {
          const res = await client.query(sql, params);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? res.rows.length };
        },
        exec: async (sql: string) => client.query(sql)
      };
      const result = await callback(txDb);
      await client.query('COMMIT');
      return result;
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure on broken connection
      }
      throw error;
    } finally {
      client.release();
    }
  }

  const db = await getDb();
  await db.query('BEGIN');
  try {
    const txDb: TxDb = {
      query: async <R = any>(sql: string, params?: any[]) => {
        const res = await db.query(sql, params);
        return { rows: res.rows, rowCount: res.rows.length };
      },
      exec: async (sql: string) => {
        if (typeof db.exec === 'function') {
          return db.exec(sql);
        }
        return db.query(sql);
      }
    };
    const result = await callback(txDb);
    await db.query('COMMIT');
    return result;
  } catch (error: any) {
    try {
      await db.query('ROLLBACK');
    } catch {
      // Ignore
    }
    const msg = error?.message || String(error);
    if (msg.includes('Aborted') || msg.includes('closed') || msg.includes('dead')) {
      global._pgliteInstance = undefined;
      global._pgliteInitPromise = undefined;
    }
    throw error;
  }
}

// Clean up database instance on server shutdown
const gracefulShutdown = async () => {
  if (global._neonPool) {
    try {
      await global._neonPool.end();
      global._neonPool = undefined;
    } catch {
      // Ignore
    }
  }
  if (global._pgliteInstance) {
    try {
      await global._pgliteInstance.close();
      global._pgliteInstance = undefined;
      global._pgliteInitPromise = undefined;
    } catch {
      // Ignore
    }
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
