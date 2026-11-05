import { Events, Interaction, MessageFlags, InteractionReplyOptions } from "discord.js";
import { BotEvent } from "../types/index.js";
import { BotClient } from "../client/BotClient.js";

export const interactionCreateEvent: BotEvent<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  async execute(rawInteraction: Interaction) {
    if (!rawInteraction.isChatInputCommand()) return;

    const client = rawInteraction.client as BotClient;
    const command = client.commands.get(rawInteraction.commandName);

    if (!command) {
      console.warn("[Warning] No command matching " + rawInteraction.commandName + " was found.");
      await rawInteraction.reply({
        content: "Error: Command " + rawInteraction.commandName + " does not exist.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await command.execute(rawInteraction);
    } catch (error) {
      console.error("[Error] Error executing " + rawInteraction.commandName + ":", error);

      const errorMessage: InteractionReplyOptions = {
        content: "There was an unexpected error while executing this command!",
        flags: MessageFlags.Ephemeral
      };

      if (rawInteraction.replied || rawInteraction.deferred) {
        await rawInteraction.followUp(errorMessage);
      } else {
        await rawInteraction.reply(errorMessage);
      }
    }
  }
};
