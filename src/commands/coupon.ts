import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder
} from "discord.js";
import { Command } from "../types/index.js";
import { couponService } from "../services/couponService.js";
import { isAuthorizedAdmin } from "../config.js";

export const couponCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("coupon")
    .setDescription("Securely manage coupon rewards (Superusers only).")
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Securely encrypt and store a single coupon code.")
        .addStringOption(opt =>
          opt
            .setName("code")
            .setDescription("The coupon code (will be encrypted with AES-256-GCM)")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName("description")
            .setDescription("Optional note/description (e.g. 50% off store)")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("add-bulk")
        .setDescription("Securely store multiple coupon codes separated by commas or spaces.")
        .addStringOption(opt =>
          opt
            .setName("codes")
            .setDescription("Multiple codes separated by commas, spaces, or lines")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName("description")
            .setDescription("Optional note/description for these coupons")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("pool")
        .setDescription("View the current status of the coupon pool (available vs claimed).")
    )
    .addSubcommand(sub =>
      sub
        .setName("reward-level")
        .setDescription("Configure which level milestones reward a coupon (e.g. Level 10).")
        .addStringOption(opt =>
          opt
            .setName("action")
            .setDescription("Add, remove, or list reward levels")
            .setRequired(true)
            .addChoices(
              { name: "Add Level Milestone", value: "add" },
              { name: "Remove Level Milestone", value: "remove" },
              { name: "List Reward Levels", value: "list" }
            )
        )
        .addIntegerOption(opt =>
          opt
            .setName("level")
            .setDescription("The level milestone (e.g. 10)")
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used within a server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!isAuthorizedAdmin(interaction.user.id)) {
      await interaction.reply({
        content: "❌ You are not authorized to manage coupons. Only designated superusers have access.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === "add") {
      const code = interaction.options.getString("code", true).trim();
      const description = interaction.options.getString("description") ?? null;

      couponService.addCoupon(guildId, code, description, interaction.user.id);
      const available = couponService.getAvailableCount(guildId);

      await interaction.reply({
        content: "🔒 **Coupon securely saved!**\n• Encrypted at rest using **AES-256-GCM**.\n• Total available coupons in pool: **" + available + "**",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === "add-bulk") {
      const rawCodes = interaction.options.getString("codes", true);
      const description = interaction.options.getString("description") ?? null;
      const codes = rawCodes.split(/[,\s\n]+/).map(c => c.trim()).filter(Boolean);

      if (codes.length === 0) {
        await interaction.reply({
          content: "❌ No valid coupon codes found in input.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const added = couponService.addBulkCoupons(guildId, codes, description, interaction.user.id);
      const available = couponService.getAvailableCount(guildId);

      await interaction.reply({
        content: "🔒 **Bulk import complete!**\n• Securely encrypted **" + added + "** coupons.\n• Total available coupons in pool: **" + available + "**",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === "pool") {
      const available = couponService.getAvailableCount(guildId);
      const claimed = couponService.getClaimedCount(guildId);
      const rewardLevels = couponService.getRewardLevels(guildId);

      const embed = new EmbedBuilder()
        .setTitle("🎫 Coupon Pool & Milestone Status")
        .setColor(0x5865F2)
        .addFields(
          { name: "🟢 Available (Unclaimed)", value: available + " coupons ready to distribute", inline: true },
          { name: "⚪ Claimed by Members", value: claimed + " coupons redeemed", inline: true },
          {
            name: "🎯 Reward Milestone Levels",
            value: rewardLevels.length > 0
              ? rewardLevels.map(lvl => "• **Level " + lvl + "**").join("\n")
              : "None configured. Use `/coupon reward-level action:Add Level Milestone level:10`"
          }
        )
        .setFooter({ text: "All codes are protected with AES-256-GCM encryption." });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === "reward-level") {
      const action = interaction.options.getString("action", true);
      const level = interaction.options.getInteger("level");

      if (action === "add") {
        if (!level) {
          await interaction.reply({
            content: "❌ Please provide a level number to add (e.g. `level: 10`).",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        couponService.addRewardLevel(guildId, level);
        await interaction.reply({
          content: "✅ **Level " + level + "** is now configured as a coupon reward milestone! Members reaching Level " + level + " will automatically receive a coupon via DM.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (action === "remove") {
        if (!level) {
          await interaction.reply({
            content: "❌ Please provide a level number to remove.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const removed = couponService.removeRewardLevel(guildId, level);
        await interaction.reply({
          content: removed
            ? "✅ Removed **Level " + level + "** from coupon reward milestones."
            : "ℹ️ **Level " + level + "** was not a configured coupon reward milestone.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (action === "list") {
        const rewardLevels = couponService.getRewardLevels(guildId);
        const listText = rewardLevels.length > 0
          ? rewardLevels.map(lvl => "• **Level " + lvl + "**").join("\n")
          : "No coupon reward levels configured.";

        await interaction.reply({
          content: "🎯 **Configured Coupon Reward Levels:**\n" + listText,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }
  }
};
