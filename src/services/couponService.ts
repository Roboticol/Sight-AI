import crypto from "node:crypto";
import { db } from "../database/db.js";
import { config } from "../config.js";

function getEncryptionKey(): Buffer {
  const secret = process.env.COUPON_ENCRYPTION_KEY || (config.token + "_sight_ai_coupon_v1_secure_key");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCoupon(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  let encrypted = cipher.update(plainText.trim(), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

export function decryptCoupon(cipherData: string): string {
  const [ivHex, authTagHex, encryptedHex] = cipherData.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid or corrupted encrypted coupon payload.");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export interface CouponRecord {
  id: number;
  guild_id: string;
  encrypted_code: string;
  description: string | null;
  created_at: number;
  created_by: string;
}

export interface ArchivedCouponRecord {
  id: number;
  guild_id: string;
  encrypted_code: string;
  description: string | null;
  created_at: number;
  created_by: string;
  claimed_by: string;
  claimed_at: number;
  claimed_level: number;
}

class CouponService {
  private stmtInsertCoupon = db.prepare(`
    INSERT INTO coupons (guild_id, encrypted_code, description, created_at, created_by, is_claimed)
    VALUES (?, ?, ?, ?, ?, 0)
  `);
  private stmtGetRandomAvailable = db.prepare(`
    SELECT id, encrypted_code, description, created_at, created_by
    FROM coupons
    WHERE guild_id = ?
    ORDER BY RANDOM()
    LIMIT 1
  `);
  private stmtInsertArchive = db.prepare(`
    INSERT INTO archived_coupons (id, guild_id, encrypted_code, description, created_at, created_by, claimed_by, claimed_at, claimed_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  private stmtDeleteActive = db.prepare(`
    DELETE FROM coupons WHERE id = ?
  `);
  private stmtRecordMilestone = db.prepare(`
    INSERT INTO user_claimed_milestones (guild_id, user_id, level, coupon_id, claimed_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  private stmtCheckClaimedMilestone = db.prepare(`
    SELECT 1 FROM user_claimed_milestones WHERE guild_id = ? AND user_id = ? AND level = ?
  `);
  private stmtGetRewardLevels = db.prepare(`
    SELECT level FROM coupon_reward_levels WHERE guild_id = ? ORDER BY level ASC
  `);
  private stmtAddRewardLevel = db.prepare(`
    INSERT OR IGNORE INTO coupon_reward_levels (guild_id, level) VALUES (?, ?)
  `);
  private stmtRemoveRewardLevel = db.prepare(`
    DELETE FROM coupon_reward_levels WHERE guild_id = ? AND level = ?
  `);
  private stmtCountAvailable = db.prepare(`
    SELECT COUNT(*) AS count FROM coupons WHERE guild_id = ?
  `);
  private stmtCountArchived = db.prepare(`
    SELECT COUNT(*) AS count FROM archived_coupons WHERE guild_id = ?
  `);
  private stmtGetUserArchivedCoupons = db.prepare(`
    SELECT id, encrypted_code, description, claimed_at, claimed_level
    FROM archived_coupons
    WHERE guild_id = ? AND claimed_by = ?
    ORDER BY claimed_at DESC
  `);

  public addCoupon(guildId: string, code: string, description: string | null, createdBy: string): number {
    const encrypted = encryptCoupon(code);
    const now = Date.now();
    const result = this.stmtInsertCoupon.run(guildId, encrypted, description, now, createdBy);
    return Number(result.lastInsertRowid);
  }

  public addBulkCoupons(guildId: string, codes: string[], description: string | null, createdBy: string): number {
    let added = 0;
    const now = Date.now();
    for (const rawCode of codes) {
      const trimmed = rawCode.trim();
      if (!trimmed) continue;
      const encrypted = encryptCoupon(trimmed);
      this.stmtInsertCoupon.run(guildId, encrypted, description, now, createdBy);
      added++;
    }
    return added;
  }

  public getAvailableCount(guildId: string): number {
    const res = (this.stmtCountAvailable.get(guildId) as unknown) as { count: number } | undefined;
    return Number(res?.count || 0);
  }

  public getClaimedCount(guildId: string): number {
    const res = (this.stmtCountArchived.get(guildId) as unknown) as { count: number } | undefined;
    return Number(res?.count || 0);
  }

  public getRewardLevels(guildId: string): number[] {
    const rows = (this.stmtGetRewardLevels.all(guildId) as unknown) as { level: number }[];
    return rows.map(r => r.level);
  }

  public addRewardLevel(guildId: string, level: number): void {
    this.stmtAddRewardLevel.run(guildId, level);
  }

  public removeRewardLevel(guildId: string, level: number): boolean {
    const res = this.stmtRemoveRewardLevel.run(guildId, level);
    return Number(res.changes) > 0;
  }

  public hasUserClaimedLevel(guildId: string, userId: string, level: number): boolean {
    const row = this.stmtCheckClaimedMilestone.get(guildId, userId, level);
    return Boolean(row);
  }

  /**
   * Atomically claims a random coupon from the active pool, moves it to the
   * archive table (so it can never be used again), records the claim milestone,
   * and decrypts the code.
   * Returns null if no coupons are available or if the user already claimed this level.
   */
  public claimRandomCoupon(
    guildId: string,
    userId: string,
    level: number
  ): { id: number; plainCode: string; description: string | null } | null {
    if (this.hasUserClaimedLevel(guildId, userId, level)) {
      return null;
    }

    db.exec("BEGIN IMMEDIATE;");
    try {
      const availableRow = (this.stmtGetRandomAvailable.get(guildId) as unknown) as {
        id: number;
        encrypted_code: string;
        description: string | null;
        created_at: number;
        created_by: string;
      } | undefined;

      if (!availableRow) {
        db.exec("ROLLBACK;");
        return null;
      }

      const now = Date.now();

      // 1. Move to archived_coupons table
      this.stmtInsertArchive.run(
        availableRow.id,
        guildId,
        availableRow.encrypted_code,
        availableRow.description,
        availableRow.created_at,
        availableRow.created_by,
        userId,
        now,
        level
      );

      // 2. Remove permanently from active coupons table
      this.stmtDeleteActive.run(availableRow.id);

      // 3. Record user milestone claim
      this.stmtRecordMilestone.run(guildId, userId, level, availableRow.id, now);

      db.exec("COMMIT;");

      const plainCode = decryptCoupon(availableRow.encrypted_code);
      return {
        id: availableRow.id,
        plainCode,
        description: availableRow.description
      };
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
  }

  public getUserClaimedCoupons(guildId: string, userId: string) {
    const rows = (this.stmtGetUserArchivedCoupons.all(guildId, userId) as unknown) as {
      id: number;
      encrypted_code: string;
      description: string | null;
      claimed_at: number;
      claimed_level: number;
    }[];

    return rows.map(row => ({
      id: row.id,
      plainCode: decryptCoupon(row.encrypted_code),
      description: row.description,
      claimedAt: row.claimed_at,
      claimedLevel: row.claimed_level
    }));
  }
}

export const couponService = new CouponService();
