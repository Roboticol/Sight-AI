import { db } from "../database/db.js";

export interface GuildSettings {
  guild_id: string;
  messages_per_level: number;
  scaling_multiplier: number;
  cooldown_seconds: number;
  level_up_channel: string;
  level_up_message: string;
  exempt_owner: number;
}

export interface UserLevel {
  guild_id: string;
  user_id: string;
  messages: number;
  xp: number;
  level: number;
  last_message_at: number;
}

export interface Exemption {
  guild_id: string;
  target_id: string;
  target_type: "user" | "role" | "channel";
}

/**
 * Calculates XP awarded per message based on the configured base requirement for Level 1.
 * Default: 5 messages for Level 1 (100 XP / 5 = 20 XP per message, matching Arcane/MEE6).
 */
export function getXpPerMessage(baseMessagesToLevel1: number): number {
  return Math.max(1, Math.round(100 / Math.max(1, baseMessagesToLevel1)));
}

/**
 * Calculates level and progress from total XP using the industry-standard quadratic curve:
 * XP to reach Level L = 5 * L^2 + 50 * L + 100
 */
export function calculateLevelFromXp(totalXp: number, baseMessagesToLevel1: number = 5) {
  const xpPerMsg = getXpPerMessage(baseMessagesToLevel1);
  let level = 0;
  let remainingXp = totalXp;

  while (true) {
    const nextLevel = level + 1;
    const stepCost = 5 * nextLevel * nextLevel + 50 * nextLevel + 100;
    if (remainingXp >= stepCost) {
      remainingXp -= stepCost;
      level = nextLevel;
    } else {
      const percentage = Math.min(100, Math.floor((remainingXp / stepCost) * 100));
      const approxMessagesNeeded = Math.ceil((stepCost - remainingXp) / xpPerMsg);
      return {
        level,
        currentXp: remainingXp,
        neededXp: stepCost,
        percentage,
        approxMessagesNeeded
      };
    }
  }
}

/**
 * Total cumulative XP required to reach a specific level.
 * Derived from sum(5 * i^2 + 50 * i + 100, i=1..L) = 5 * L * (2 * L^2 + 27 * L + 91) / 6
 */
export function totalXpForLevel(targetLevel: number): number {
  if (targetLevel <= 0) return 0;
  return Math.round((5 * targetLevel * (2 * targetLevel * targetLevel + 27 * targetLevel + 91)) / 6);
}

export function createProgressBar(current: number, total: number, size = 10): string {
  if (total <= 0) return "░".repeat(size);
  const ratio = Math.min(Math.max(current / total, 0), 1);
  const filled = Math.round(ratio * size);
  const empty = Math.max(0, size - filled);
  return "█".repeat(filled) + "░".repeat(empty);
}

class LevelingService {
  private stmtGetSettings = db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?");
  private stmtInsertSettings = db.prepare(`
    INSERT INTO guild_settings (guild_id, messages_per_level, scaling_multiplier, cooldown_seconds, level_up_channel, level_up_message, exempt_owner)
    VALUES (?, 5, 1.0, 60, 'current', '🎉 Congratulations {user}, you leveled up to **Level {level}**!', 1)
  `);
  private stmtGetUser = db.prepare("SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?");
  private stmtInsertUser = db.prepare(`
    INSERT INTO user_levels (guild_id, user_id, messages, xp, level, last_message_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  private stmtUpdateUser = db.prepare(`
    UPDATE user_levels SET messages = ?, xp = ?, level = ?, last_message_at = ? WHERE guild_id = ? AND user_id = ?
  `);
  private stmtUpdateUserMessagesOnly = db.prepare(`
    UPDATE user_levels SET messages = ? WHERE guild_id = ? AND user_id = ?
  `);
  private stmtGetExemptions = db.prepare("SELECT * FROM exemptions WHERE guild_id = ?");
  private stmtAddExemption = db.prepare(`
    INSERT OR REPLACE INTO exemptions (guild_id, target_id, target_type) VALUES (?, ?, ?)
  `);
  private stmtRemoveExemption = db.prepare("DELETE FROM exemptions WHERE guild_id = ? AND target_id = ?");

  public getGuildSettings(guildId: string): GuildSettings {
    let settings = (this.stmtGetSettings.get(guildId) as unknown) as GuildSettings | undefined;
    if (!settings) {
      this.stmtInsertSettings.run(guildId);
      settings = (this.stmtGetSettings.get(guildId) as unknown) as GuildSettings;
    }
    return settings;
  }

  public updateGuildSettings(guildId: string, updates: Partial<Omit<GuildSettings, "guild_id">>): GuildSettings {
    const current = this.getGuildSettings(guildId);
    const updated: GuildSettings = {
      guild_id: guildId,
      messages_per_level: updates.messages_per_level ?? current.messages_per_level,
      scaling_multiplier: updates.scaling_multiplier ?? current.scaling_multiplier,
      cooldown_seconds: updates.cooldown_seconds ?? current.cooldown_seconds,
      level_up_channel: updates.level_up_channel ?? current.level_up_channel,
      level_up_message: updates.level_up_message ?? current.level_up_message,
      exempt_owner: updates.exempt_owner ?? current.exempt_owner
    };

    const updateStmt = db.prepare(`
      UPDATE guild_settings
      SET messages_per_level = ?, scaling_multiplier = ?, cooldown_seconds = ?, level_up_channel = ?, level_up_message = ?, exempt_owner = ?
      WHERE guild_id = ?
    `);
    updateStmt.run(
      updated.messages_per_level,
      updated.scaling_multiplier,
      updated.cooldown_seconds,
      updated.level_up_channel,
      updated.level_up_message,
      updated.exempt_owner,
      guildId
    );

    return updated;
  }

  public getExemptions(guildId: string): Exemption[] {
    return (this.stmtGetExemptions.all(guildId) as unknown as Exemption[]) || [];
  }

  public isExempt(guildId: string, userId: string, channelId: string, roleIds: string[], ownerId?: string): boolean {
    const settings = this.getGuildSettings(guildId);
    if (settings.exempt_owner === 1 && ownerId && userId === ownerId) {
      return true;
    }

    const exemptions = this.getExemptions(guildId);
    for (const ex of exemptions) {
      if (ex.target_type === "user" && ex.target_id === userId) return true;
      if (ex.target_type === "channel" && ex.target_id === channelId) return true;
      if (ex.target_type === "role" && roleIds.includes(ex.target_id)) return true;
    }

    return false;
  }

  public addExemption(guildId: string, targetId: string, targetType: "user" | "role" | "channel"): void {
    this.stmtAddExemption.run(guildId, targetId, targetType);
  }

  public removeExemption(guildId: string, targetId: string): boolean {
    const result = this.stmtRemoveExemption.run(guildId, targetId);
    return Number(result.changes) > 0;
  }

  public processMessage(
    guildId: string,
    userId: string,
    channelId: string,
    roleIds: string[],
    ownerId?: string
  ): {
    leveledUp: boolean;
    oldLevel: number;
    newLevel: number;
    totalMessages: number;
    xp: number;
    onCooldown: boolean;
  } | null {
    if (this.isExempt(guildId, userId, channelId, roleIds, ownerId)) {
      return null;
    }

    const settings = this.getGuildSettings(guildId);
    const now = Date.now();
    const userRow = (this.stmtGetUser.get(guildId, userId) as unknown) as UserLevel | undefined;
    const xpPerMsg = getXpPerMessage(settings.messages_per_level);

    if (userRow) {
      const totalMessages = userRow.messages + 1;
      const cooldownMs = settings.cooldown_seconds * 1000;
      const onCooldown = cooldownMs > 0 && (now - userRow.last_message_at < cooldownMs);

      if (onCooldown) {
        // Track the user's message count accurately, but do not grant XP during cooldown
        this.stmtUpdateUserMessagesOnly.run(totalMessages, guildId, userId);
        return {
          leveledUp: false,
          oldLevel: userRow.level,
          newLevel: userRow.level,
          totalMessages,
          xp: userRow.xp,
          onCooldown: true
        };
      }

      const newXp = userRow.xp + xpPerMsg;
      const progress = calculateLevelFromXp(newXp, settings.messages_per_level);
      const leveledUp = progress.level > userRow.level;

      this.stmtUpdateUser.run(totalMessages, newXp, progress.level, now, guildId, userId);

      return {
        leveledUp,
        oldLevel: userRow.level,
        newLevel: progress.level,
        totalMessages,
        xp: newXp,
        onCooldown: false
      };
    } else {
      const totalMessages = 1;
      const newXp = xpPerMsg;
      const progress = calculateLevelFromXp(newXp, settings.messages_per_level);

      this.stmtInsertUser.run(guildId, userId, totalMessages, newXp, progress.level, now);

      return {
        leveledUp: progress.level > 0,
        oldLevel: 0,
        newLevel: progress.level,
        totalMessages,
        xp: newXp,
        onCooldown: false
      };
    }
  }

  public getUserRank(guildId: string, userId: string) {
    const settings = this.getGuildSettings(guildId);
    const userRow = (this.stmtGetUser.get(guildId, userId) as unknown) as UserLevel | undefined;

    const totalMessages = userRow ? userRow.messages : 0;
    const totalXp = userRow ? userRow.xp : 0;
    const progress = calculateLevelFromXp(totalXp, settings.messages_per_level);

    // Calculate server rank based on level and XP
    const rankStmt = db.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM user_levels
      WHERE guild_id = ? AND (level > ? OR (level = ? AND xp > ?))
    `);
    const rankResult = (rankStmt.get(guildId, progress.level, progress.level, totalXp) as unknown) as { rank: number } | undefined;

    // Total ranked users
    const countStmt = db.prepare("SELECT COUNT(*) AS total FROM user_levels WHERE guild_id = ?");
    const countResult = (countStmt.get(guildId) as unknown) as { total: number } | undefined;

    return {
      rank: Number(rankResult?.rank || 1),
      totalUsers: Math.max(1, Number(countResult?.total || 1)),
      level: progress.level,
      totalMessages,
      totalXp,
      currentXp: progress.currentXp,
      neededXp: progress.neededXp,
      percentage: progress.percentage,
      approxMessagesNeeded: progress.approxMessagesNeeded
    };
  }

  public getLeaderboard(guildId: string, page = 1, limit = 10) {
    const offset = Math.max(0, (page - 1) * limit);
    const countStmt = db.prepare("SELECT COUNT(*) AS total FROM user_levels WHERE guild_id = ?");
    const countResult = (countStmt.get(guildId) as unknown) as { total: number } | undefined;
    const totalUsers = Number(countResult?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

    const listStmt = db.prepare(`
      SELECT user_id, messages, xp, level
      FROM user_levels
      WHERE guild_id = ?
      ORDER BY level DESC, xp DESC, messages DESC
      LIMIT ? OFFSET ?
    `);

    const rows = listStmt.all(guildId, limit, offset) as unknown as { user_id: string; messages: number; xp: number; level: number }[];

    return {
      page,
      totalPages,
      totalUsers,
      items: rows.map((row, index) => ({
        rank: offset + index + 1,
        userId: row.user_id,
        messages: row.messages,
        xp: row.xp,
        level: row.level
      }))
    };
  }

  public setUserLevel(guildId: string, userId: string, targetLevel: number, messages?: number) {
    const settings = this.getGuildSettings(guildId);
    const xp = totalXpForLevel(targetLevel);
    const xpPerMsg = getXpPerMessage(settings.messages_per_level);
    const finalMessages = messages !== undefined ? messages : Math.round(xp / xpPerMsg);

    const progress = calculateLevelFromXp(xp, settings.messages_per_level);
    const now = Date.now();

    const userRow = (this.stmtGetUser.get(guildId, userId) as unknown) as UserLevel | undefined;
    if (userRow) {
      this.stmtUpdateUser.run(finalMessages, xp, progress.level, now, guildId, userId);
    } else {
      this.stmtInsertUser.run(guildId, userId, finalMessages, xp, progress.level, now);
    }

    return {
      level: progress.level,
      totalMessages: finalMessages,
      xp
    };
  }

  public setLevelRole(guildId: string, level: number, roleId: string): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO level_roles (guild_id, level, role_id)
      VALUES (?, ?, ?)
    `);
    stmt.run(guildId, level, roleId);
  }

  public removeLevelRole(guildId: string, level: number): boolean {
    const stmt = db.prepare(`
      DELETE FROM level_roles WHERE guild_id = ? AND level = ?
    `);
    const result = stmt.run(guildId, level);
    return Number(result.changes) > 0;
  }

  public getLevelRoles(guildId: string): { level: number; role_id: string }[] {
    const stmt = db.prepare(`
      SELECT level, role_id FROM level_roles WHERE guild_id = ? ORDER BY level ASC
    `);
    return (stmt.all(guildId) as unknown) as { level: number; role_id: string }[];
  }

  public getEligibleRoles(guildId: string, userLevel: number): { level: number; role_id: string }[] {
    const stmt = db.prepare(`
      SELECT level, role_id FROM level_roles WHERE guild_id = ? AND level <= ? ORDER BY level ASC
    `);
    return (stmt.all(guildId, userLevel) as unknown) as { level: number; role_id: string }[];
  }

  public getNewRolesEarned(guildId: string, oldLevel: number, newLevel: number): { level: number; role_id: string }[] {
    const stmt = db.prepare(`
      SELECT level, role_id FROM level_roles WHERE guild_id = ? AND level > ? AND level <= ? ORDER BY level ASC
    `);
    return (stmt.all(guildId, oldLevel, newLevel) as unknown) as { level: number; role_id: string }[];
  }
}

export const levelingService = new LevelingService();
