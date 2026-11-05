import { Command } from "../types/index.js";
import { pingCommand } from "./ping.js";
import { serverCommand } from "./server.js";
import { userCommand } from "./user.js";
import { rankCommand } from "./rank.js";
import { leaderboardCommand } from "./leaderboard.js";
import { levelSetupCommand } from "./levelSetup.js";
import { levelRolesCommand } from "./levelRoles.js";
import { couponCommand } from "./coupon.js";
import { myCouponsCommand } from "./myCoupons.js";

export const commands: Command[] = [
  pingCommand,
  serverCommand,
  userCommand,
  rankCommand,
  leaderboardCommand,
  levelSetupCommand,
  levelRolesCommand,
  couponCommand,
  myCouponsCommand
];
