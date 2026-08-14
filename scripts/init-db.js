#!/usr/bin/env node
/**
 * Initialize the SQLite database with the books schema
 */

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'bookshelf.db')

// Ensure data directory exists
import fs from 'fs'
const dataDir = path.join(ROOT, 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(DB_PATH)

// Enable foreign keys
db.pragma('journal_mode = WAL')

// Create books table
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    shelf INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    author TEXT,
    isbn TEXT,
    cover_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS book_tags (
    book_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (book_id, tag),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_books_shelf ON books(shelf);
  CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
  CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
  CREATE INDEX IF NOT EXISTS idx_book_tags_tag ON book_tags(tag);
`)

console.log('✅ Database initialized at:', DB_PATH)

db.close()
