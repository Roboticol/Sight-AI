import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { Command } from "../types/index.js";

export const userCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("Provides information about the user.")
    .addUserOption(option =>
      option.setName("target")
        .setDescription("The user to get info for (defaults to yourself)")
        .setRequired(false)
    ),
  async execute(interaction) {
    const target = interaction.options.getUser("target") ?? interaction.user;
    const isBot = target.bot ? "Yes" : "No";
    const createdTimestamp = Math.floor(target.createdAt.getTime() / 1000);

    await interaction.reply({
      content: "**User Info:**\n• **Username:** " + target.tag + "\n• **ID:** " + target.id + "\n• **Bot:** " + isBot + "\n• **Account Created:** <t:" + createdTimestamp + ":R>",
      flags: MessageFlags.Ephemeral
    });
  }
};
