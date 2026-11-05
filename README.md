# Sight AI Discord Bot

A feature-rich, modular Discord bot built with **TypeScript**, **Node.js**, **discord.js v14**, and built-in **SQLite** storage.

---

## 🤖 Bot Information
- **Bot Name:** Sight AI
- **Client ID:** `1567848458600059034`
- **Invite URL:**
  [Click here to invite Sight AI to your Discord Server](https://discord.com/oauth2/authorize?client_id=1567848458600059034&permissions=8&integration_type=0&scope=bot+applications.commands)

---

## 🏆 Leveling System Features

Similar to bots like Arcane.gg, Sight AI tracks user message activity and rewards levels:
- **Message-Based Progression:** Users gain levels automatically by chatting.
- **Configurable XP Curve:** Supports linear or progressive/exponential scaling.
- **Anti-Spam Cooldown:** Configurable cooldown period (default 60s) to prevent spamming.
- **Server Leaderboard & Ranking:** SQL-backed fast ranking calculations.
- **Custom Exclusions:** Exclude the server owner, specific members, roles, or channels.
- **Level-Up Announcements:** Choose current channel, a dedicated announcement channel, or disable alerts.

### Commands

| Command | Permission | Description |
|---|---|---|
| `/rank [user]` | Everyone | View your or another member's current level, message progress, visual XP bar, and rank in the server. |
| `/leaderboard [page]` | Everyone | View the server's top members sorted by level and messages. |
| `/level-setup settings` | Manage Server | Configure messages needed per level, scaling multiplier, cooldown, owner exemption, and announcements. |
| `/level-setup exempt-user` | Manage Server | Add or remove a user from the leveling system. |
| `/level-setup exempt-role` | Manage Server | Add or remove a role from the leveling system. |
| `/level-setup exempt-channel` | Manage Server | Add or remove a channel from earning leveling XP. |
| `/level-setup view` | Manage Server | View the guild's current configuration and all exempt members/roles/channels. |
| `/level-setup set-user-level` | Manage Server | Manually adjust a member's level and message count. |
| `/ping` | Everyone | Check bot roundtrip latency and WebSocket heartbeat. |
| `/server` | Everyone | Display server statistics and info. |
| `/user [target]` | Everyone | View Discord user details. |

---

## ⚙️ Leveling Formula & Behavior

1. **Messages Per Level:**
   - Base requirement for Level 1 (default: 10 messages).
2. **Scaling Multiplier:**
   - `1.0` (default): Linear progression (every level requires the base number of messages).
   - `> 1.0` (e.g. `1.25`): Progressive RPG curve (each subsequent level requires `base * multiplier^(level-1)` messages).
3. **Anti-Spam Cooldown:**
   - By default, users receive XP at most once every 60 seconds. Set to `0` in `/level-setup settings` if you want every message to count.
4. **Exclusions:**
   - Server Owner can be automatically excluded by toggling `exempt_owner: true`.
   - Specific users, roles (e.g. Bots, Staff), and channels (e.g. #bot-commands) can be exempted.

---

## 📁 Project Architecture

```
├── data/
│   └── leveling.sqlite    # SQLite database (persists levels & guild settings)
├── dist/                  # Compiled JavaScript
├── src/
│   ├── client/
│   │   └── BotClient.ts   # Extended Discord Client with command registry
│   ├── commands/
│   │   ├── ping.ts        # Latency command
│   │   ├── server.ts      # Server info command
│   │   ├── user.ts        # User info command
│   │   ├── rank.ts        # Level & rank inspector with progress bar
│   │   ├── leaderboard.ts # Server leaderboard with medals
│   │   ├── levelSetup.ts  # Administrative leveling system configuration
│   │   └── index.ts       # Command registry
│   ├── database/
│   │   └── db.ts          # SQLite connection and table initialization
│   ├── events/
│   │   ├── ready.ts       # Client ready handler
│   │   ├── interactionCreate.ts # Command routing & error handling
│   │   ├── messageCreate.ts     # Message leveling listener & announcements
│   │   └── index.ts       # Event registry
│   ├── services/
│   │   └── levelingService.ts # Leveling engine, math, and DB queries
│   ├── types/
│   │   └── index.ts       # TypeScript interfaces
│   ├── config.ts          # Environment variables validation
│   ├── deploy-commands.ts # Slash command deployment tool
│   └── index.ts           # Bot entry point
├── package.json
└── tsconfig.json
```

---

## 🚀 How to Run

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Deploy Slash Commands:**
   ```bash
   npm run deploy
   ```

3. **Run the Bot:**
   - Development (live reload):
     ```bash
     npm run dev
     ```
   - Production:
     ```bash
     npm run build
     npm start
     ```

---

## 🎁 Secure Coupon Sharing Feature

The bot allows authorized superusers to load discount / promo coupon codes into a secure pool and automatically distribute them to members reaching milestone levels (e.g. Level 10, Level 20, Level 50) via private DM.

### Security Architecture
- **AES-256-GCM Encryption at Rest:** Every coupon code stored in the SQLite database is encrypted with AES-256-GCM authenticated cipher. The plaintext code is never stored in the database.
- **Strict Superuser Authorization:** Only the two authorized user IDs (`727742542837186560` and `534753711915008001`) can add, manage, or view the coupon pool.
- **Zero Public Leakage:** All coupon management commands and replies are **ephemeral** (visible only to the admin running the command).
- **One-Time Archival Database:** Each coupon code is strictly single-use. The moment it is distributed, it is atomically deleted from the active active pool and moved to the `archived_coupons` database table with claim metadata (who claimed it, timestamp, and level achieved). It can never be selected or used again.\n- **Silent Fallback:** If a member reaches a milestone level but no coupons are available in the pool (or if they have already claimed it), the bot remains completely silent—no coupon DM or coupon message is sent.

### Coupon Commands

| Command | Permission | Description |
|---|---|---|
| `/coupon add code:<text> [description]` | Superusers Only | Securely encrypt and add a single coupon code into the pool. |
| `/coupon add-bulk codes:<list> [description]` | Superusers Only | Add multiple coupon codes at once (separated by spaces, commas, or lines). |
| `/coupon reward-level action:Add level:<num>` | Superusers Only | Set which level milestone automatically awards a coupon (e.g. Level 10). |
| `/coupon reward-level action:List` | Superusers Only | List all configured coupon reward milestone levels. |
| `/coupon pool` | Superusers Only | View available vs claimed coupon counts and pool health. |
| `/my-coupons` | Everyone | Privately inspect any coupon codes you have earned on the server (ephemeral). |
