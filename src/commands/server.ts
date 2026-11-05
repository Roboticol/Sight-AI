import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { Command } from "../types/index.js";

export const serverCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("server")
    .setDescription("Provides information about this server."),
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used within a server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const { name, memberCount, createdAt, ownerId } = interaction.guild;
    const createdTimestamp = Math.floor(createdAt.getTime() / 1000);
    await interaction.reply({
      content: "**Server Info:**\n• **Name:** " + name + "\n• **Total Members:** " + memberCount + "\n• **Owner ID:** <@" + ownerId + ">\n• **Created:** <t:" + createdTimestamp + ":R>",
      flags: MessageFlags.Ephemeral
    });
  }
};
