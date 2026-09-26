const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DATA_DIR =
  process.env.HINAKI_DATA_DIR ||
  path.join(__dirname, '..', '..', 'data');

fs.mkdirSync(DATA_DIR, {
  recursive: true,
});

const DB_PATH = path.join(
  DATA_DIR,
  'heenak.db'
);

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0
        CHECK(points >= 0),

      created_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      updated_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      PRIMARY KEY (guild_id, user_id)
    );


    CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,

      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL
        CHECK(balance_after >= 0),

      source TEXT NOT NULL,
      description TEXT,

      reference_type TEXT,
      reference_id TEXT,

      created_by TEXT,

      created_at TEXT NOT NULL
        DEFAULT (datetime('now'))
    );


    CREATE TABLE IF NOT EXISTS recruitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,

      message_id TEXT UNIQUE,

      type TEXT NOT NULL,
      creator_id TEXT NOT NULL,

      voice_kind TEXT NOT NULL,
      voice_room_number INTEGER NOT NULL,
      voice_channel_id TEXT,

      game_name TEXT,

      capacity INTEGER NOT NULL
        CHECK(capacity >= 2),

      start_time TEXT NOT NULL,

      status TEXT NOT NULL
        DEFAULT 'OPEN',

      created_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      updated_at TEXT NOT NULL
        DEFAULT (datetime('now'))
    );


    CREATE TABLE IF NOT EXISTS recruitment_members (
      recruitment_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,

      is_active INTEGER NOT NULL DEFAULT 1
        CHECK(is_active IN (0, 1)),

      joined_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      left_at TEXT,

      PRIMARY KEY (
        recruitment_id,
        user_id
      ),

      FOREIGN KEY (recruitment_id)
        REFERENCES recruitments(id)
        ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS recruitment_watchers (
      recruitment_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,

      is_active INTEGER NOT NULL DEFAULT 1
        CHECK(is_active IN (0, 1)),

      created_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      notified_at TEXT,

      PRIMARY KEY (
        recruitment_id,
        user_id
      ),

      FOREIGN KEY (recruitment_id)
        REFERENCES recruitments(id)
        ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS newbie_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      guild_id TEXT NOT NULL,
      recruitment_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,

      voice_minutes INTEGER NOT NULL DEFAULT 0,

      qualified INTEGER NOT NULL DEFAULT 0
        CHECK(qualified IN (0, 1)),

      points_awarded INTEGER NOT NULL DEFAULT 0,

      completed_at TEXT,

      created_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      UNIQUE (
        recruitment_id,
        user_id
      ),

      FOREIGN KEY (recruitment_id)
        REFERENCES recruitments(id)
        ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS shop_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      order_code TEXT NOT NULL UNIQUE,

      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,

      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,

      price INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,

      status TEXT NOT NULL
        DEFAULT 'PURCHASED',

      created_at TEXT NOT NULL
        DEFAULT (datetime('now'))
    );


    CREATE TABLE IF NOT EXISTS monthly_awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      guild_id TEXT NOT NULL,
      award_month TEXT NOT NULL,
      user_id TEXT NOT NULL,

      activity_count INTEGER NOT NULL DEFAULT 0,

      award_complete INTEGER NOT NULL DEFAULT 0
        CHECK(award_complete IN (0, 1)),

      awarded_at TEXT,

      created_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      UNIQUE (
        guild_id,
        award_month,
        user_id
      )
    );


    CREATE TABLE IF NOT EXISTS shop_inventory (
      product_code TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,

      stock INTEGER NOT NULL DEFAULT 0
        CHECK(stock >= 0),

      updated_at TEXT NOT NULL
        DEFAULT (datetime('now'))
    );


    CREATE TABLE IF NOT EXISTS user_promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,

      promotion_type TEXT NOT NULL,

      from_role_id TEXT NOT NULL,
      to_role_id TEXT NOT NULL,

      threshold_points INTEGER NOT NULL,

      promoted_at TEXT NOT NULL
        DEFAULT (datetime('now')),

      UNIQUE (
        guild_id,
        user_id,
        promotion_type
      )
    );


    CREATE INDEX IF NOT EXISTS
      idx_point_transactions_user
    ON point_transactions (
      guild_id,
      user_id,
      created_at
    );


    CREATE INDEX IF NOT EXISTS
      idx_recruitments_status
    ON recruitments (
      guild_id,
      status
    );


    CREATE INDEX IF NOT EXISTS
      idx_newbie_activity_user
    ON newbie_activity (
      guild_id,
      user_id
    );


    CREATE INDEX IF NOT EXISTS
      idx_shop_purchases_user
    ON shop_purchases (
      guild_id,
      user_id,
      created_at
    );
  `);

  console.log(
    `💾 희낙이 DB 준비 완료: ${DB_PATH}`
  );
}

module.exports = {
  db,
  DB_PATH,
  initDatabase,
};