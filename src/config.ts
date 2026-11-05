import "dotenv/config";

interface Config {
  token: string;
  clientId?: string;
  guildId?: string;
  adminUserIds: string[];
}

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in environment variables. Please check your .env file.");
}

const defaultAdminIds = [
  "727742542837186560",
  "534753711915008001"
];

const envAdminIds = process.env.ADMIN_USER_IDS
  ? process.env.ADMIN_USER_IDS.split(",").map(id => id.trim()).filter(Boolean)
  : [];

export const config: Config = {
  token,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  adminUserIds: envAdminIds.length > 0 ? envAdminIds : defaultAdminIds
};

export function isAuthorizedAdmin(userId: string): boolean {
  return config.adminUserIds.includes(userId);
}
