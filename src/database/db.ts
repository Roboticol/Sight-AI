import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync("data", { recursive: true });
const dbPath = path.resolve("data", "leveling.sqlite");

export const db = new DatabaseSync(dbPath);

// Initialize tables and indices
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    messages_per_level INTEGER NOT NULL DEFAULT 5,
    scaling_multiplier REAL NOT NULL DEFAULT 1.0,
    cooldown_seconds INTEGER NOT NULL DEFAULT 60,
    level_up_channel TEXT NOT NULL DEFAULT 'current',
    level_up_message TEXT NOT NULL DEFAULT '🎉 Congratulations {user}, you leveled up to **Level {level}**!',
    exempt_owner INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS user_levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0,
    last_message_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS exemptions (
    guild_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    PRIMARY KEY (guild_id, target_id)
  );

  CREATE TABLE IF NOT EXISTS level_roles (
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, level)
  );

  
  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    encrypted_code TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    is_claimed INTEGER NOT NULL DEFAULT 0,
    claimed_by TEXT,
    claimed_at INTEGER,
    claimed_level INTEGER
  );

  CREATE TABLE IF NOT EXISTS coupon_reward_levels (
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    PRIMARY KEY (guild_id, level)
  );

  CREATE TABLE IF NOT EXISTS user_claimed_milestones (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    coupon_id INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, level)
  );

  
  CREATE TABLE IF NOT EXISTS archived_coupons (
    id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL,
    encrypted_code TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    claimed_by TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    claimed_level INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_coupons_pool ON coupons (guild_id, is_claimed);

  CREATE INDEX IF NOT EXISTS idx_user_levels_ranking
    ON user_levels (guild_id, level DESC, messages DESC);
`);

try {
  const tableInfo = db.prepare("PRAGMA table_info(user_levels)").all() as { name: string }[];
  if (!tableInfo.some(col => col.name === "xp")) {
    db.exec("ALTER TABLE user_levels ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE user_levels SET xp = messages * 20;");
  }
} catch (e) {
  // Ignored if table does not exist yet
}
