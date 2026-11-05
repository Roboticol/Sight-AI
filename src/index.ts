import { BotClient } from './client/BotClient.js';
import { config } from './config.js';
import { commands } from './commands/index.js';
import { events } from './events/index.js';

const client = new BotClient();

// Register commands
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// Register events
for (const event of events) {
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection at]:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]:', error);
});

// Connect to Discord
client.login(config.token).catch((err) => {
  console.error('[Login Error] Failed to connect to Discord:', err);
  process.exit(1);
});
