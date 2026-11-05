import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { Command } from "../types/index.js";
import { levelingService } from "../services/levelingService.js";

export const leaderboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server's leveling leaderboard.")
    .addIntegerOption(option =>
      option.setName("page")
        .setDescription("Page number to view (defaults to 1)")
        .setMinValue(1)
        .setRequired(false)
    ),
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used within a server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const page = interaction.options.getInteger("page") ?? 1;
    const lb = levelingService.getLeaderboard(interaction.guild.id, page, 10);

    const embed = new EmbedBuilder()
      .setTitle("🏆 " + interaction.guild.name + " Leaderboard")
      .setColor(0xF1C40F)
      .setThumbnail(interaction.guild.iconURL() ?? null);

    if (lb.items.length === 0) {
      embed.setDescription("No members have earned XP on this server yet! Start chatting to climb the leaderboard.");
    } else {
      const lines = lb.items.map(item => {
        let medal = "#" + item.rank;
        if (item.rank === 1) medal = "🥇";
        else if (item.rank === 2) medal = "🥈";
        else if (item.rank === 3) medal = "🥉";

        return medal + " <@" + item.userId + "> • **Level " + item.level + "** (" + item.xp.toLocaleString() + " XP • " + item.messages.toLocaleString() + " msgs)";
      });

      embed.setDescription(lines.join("\n\n"));
      embed.setFooter({
        text: "Page " + lb.page + " of " + lb.totalPages + " • Total Ranked Members: " + lb.totalUsers
      });
    }

    await interaction.reply({ embeds: [embed] });
  }
};
