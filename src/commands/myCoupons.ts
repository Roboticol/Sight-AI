import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder
} from "discord.js";
import { Command } from "../types/index.js";
import { couponService } from "../services/couponService.js";

export const myCouponsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("my-coupons")
    .setDescription("View the reward coupon codes you have earned on this server."),
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used within a server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const coupons = couponService.getUserClaimedCoupons(interaction.guild.id, interaction.user.id);

    if (coupons.length === 0) {
      await interaction.reply({
        content: "ℹ️ You haven't earned any coupon rewards on this server yet. Keep chatting to level up!",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎁 Your Earned Coupon Rewards")
      .setColor(0xE91E63)
      .setDescription("Here are your exclusive coupon codes. Keep them private and secure!");

    for (const c of coupons) {
      const dateStr = c.claimedAt ? "<t:" + Math.floor(c.claimedAt / 1000) + ":d>" : "Recently";
      const desc = c.description ? " (" + c.description + ")" : "";
      embed.addFields({
        name: "Milestone: Level " + c.claimedLevel + desc + " • " + dateStr,
        value: "```\n" + c.plainCode + "\n```"
      });
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
};
