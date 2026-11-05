import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types/index.js";

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong and current API latency!"),
  async execute(interaction) {
    const response = await interaction.reply({ content: "Pinging...", withResponse: true });
    const replyMessage = response.resource?.message;
    const latency = replyMessage
      ? replyMessage.createdTimestamp - interaction.createdTimestamp
      : Date.now() - interaction.createdTimestamp;
    const apiPing = interaction.client.ws.ping;
    await interaction.editReply(
      "Pong!\n• Roundtrip Latency: " + latency + "ms\n• WebSocket Heartbeat: " + apiPing + "ms"
    );
  }
};
