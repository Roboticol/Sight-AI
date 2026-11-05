import { Events } from 'discord.js';
import { BotEvent } from '../types/index.js';
import { BotClient } from '../client/BotClient.js';

export const readyEvent: BotEvent<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[Bot Ready] Logged in as ${client.user?.tag} (ID: ${client.user?.id})`);
    console.log(`[Commands] ${client instanceof BotClient ? client.commands.size : 0} commands loaded into memory.`);
  }
};
