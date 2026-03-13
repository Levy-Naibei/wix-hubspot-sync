import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

let Database: typeof import('better-sqlite3');
let db: import('better-sqlite3').Database;

export function getDb(): import('better-sqlite3').Database {
  if (!db) {
    // ensure the native module is loaded only once and catch failures
    if (!Database) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        Database = require('better-sqlite3');
      } catch (err: any) {
        logger.error('Unable to load better-sqlite3 native module', { err });
        throw new Error(
          'Database initialization failed: cannot load native sqlite module. ' +
            'Run `npm rebuild better-sqlite3` or reinstall dependencies for your current Node/arch.'
        );
      }
    }

    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    logger.info('Database initialized', { path: config.dbPath });
  }
  return db;
}

function runMigrations(db: import('better-sqlite3').Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY,
      site_id TEXT NOT NULL UNIQUE,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      scope TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'Bearer',
      hubspot_portal_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_mappings (
      id INTEGER PRIMARY KEY,
      wix_contact_id TEXT NOT NULL,
      hubspot_contact_id TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      last_sync_source TEXT NOT NULL CHECK(last_sync_source IN ('wix','hubspot')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(wix_contact_id),
      UNIQUE(hubspot_contact_id)
    );

    CREATE TABLE IF NOT EXISTS field_mappings (
      id INTEGER PRIMARY KEY,
      site_id TEXT NOT NULL,
      wix_field TEXT NOT NULL,
      hubspot_property TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('wix_to_hubspot','hubspot_to_wix','bidirectional')),
      transform TEXT CHECK(transform IN ('trim','lowercase','uppercase') OR transform IS NULL),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(site_id, hubspot_property)
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY,
      site_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      wix_contact_id TEXT,
      hubspot_contact_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('success','skipped','error')),
      reason TEXT,
      correlation_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sync_log_site_created
      ON sync_log(site_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_contact_mappings_wix
      ON contact_mappings(wix_contact_id);

    CREATE INDEX IF NOT EXISTS idx_contact_mappings_hubspot
      ON contact_mappings(hubspot_contact_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
