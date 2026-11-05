import { Client, ClientOptions, Collection, GatewayIntentBits } from 'discord.js';
import { Command } from '../types/index.js';

export class BotClient extends Client {
  public commands: Collection<string, Command> = new Collection();

  constructor(options?: Partial<ClientOptions>) {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ],
      ...options
    });
  }
}
