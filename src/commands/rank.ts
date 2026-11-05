import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { Command } from "../types/index.js";
import { levelingService, createProgressBar } from "../services/levelingService.js";

export const rankCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your or another member's current level, messages, XP, and rank.")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("The user to check (defaults to yourself)")
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

    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const stats = levelingService.getUserRank(interaction.guild.id, targetUser.id);
    const progressBar = createProgressBar(stats.currentXp, stats.neededXp, 10);

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const roleIds = member ? member.roles.cache.map(r => r.id) : [];
    const isExempt = levelingService.isExempt(
      interaction.guild.id,
      targetUser.id,
      interaction.channelId,
      roleIds,
      interaction.guild.ownerId
    );

    const embed = new EmbedBuilder()
      .setAuthor({
        name: targetUser.username + "'s Server Rank",
        iconURL: targetUser.displayAvatarURL()
      })
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0x5865F2)
      .addFields(
        { name: "🏆 Server Rank", value: "#" + stats.rank + " of " + stats.totalUsers, inline: true },
        { name: "⭐ Level", value: "Level **" + stats.level + "**", inline: true },
        { name: "💬 Total Messages", value: "**" + stats.totalMessages.toLocaleString() + "** messages", inline: true },
        { name: "✨ Experience (XP)", value: stats.currentXp.toLocaleString() + " / " + stats.neededXp.toLocaleString() + " XP", inline: true },
        {
          name: "📈 Progress to Level " + (stats.level + 1),
          value: "`[" + progressBar + "]` **" + stats.percentage + "%** (~" + stats.approxMessagesNeeded + " messages remaining)"
        }
      );

    if (isExempt) {
      embed.setFooter({ text: "⚠️ This user is currently exempt from the leveling system." });
    }

    await interaction.reply({ embeds: [embed] });
  }
};
