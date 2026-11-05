import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";

const commandData = commands.map(cmd => cmd.data.toJSON());
const rest = new REST({ version: "10" }).setToken(config.token);

async function deploy() {
  try {
    console.log("[Deploy] Preparing " + commandData.length + " application (/) commands...");

    let clientId = config.clientId;
    if (!clientId) {
      const tokenPrefix = config.token.split(".")[0];
      try {
        clientId = Buffer.from(tokenPrefix, "base64").toString("ascii");
      } catch (err) {
        console.warn("[Deploy] Could not decode CLIENT_ID from token prefix.");
      }
    }

    if (!clientId) {
      throw new Error("CLIENT_ID is required to register slash commands. Please set CLIENT_ID in your .env file.");
    }

    const forceGlobal = process.argv.includes("--global");

    if (config.guildId && !forceGlobal) {
      console.log("[Deploy] Registering commands directly to server: " + config.guildId + " (INSTANT update)...");
      await rest.put(
        Routes.applicationGuildCommands(clientId, config.guildId),
        { body: commandData }
      );
      console.log("[Deploy] Successfully registered commands to server!");

      // Clear global commands to prevent duplicate entries in this server
      console.log("[Deploy] Ensuring global commands are clean to prevent duplicates...");
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] }
      );
    } else {
      console.log("[Deploy] Registering commands globally across all Discord servers...");
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );
      console.log("[Deploy] Successfully registered global commands!");

      if (config.guildId) {
        await rest.put(
          Routes.applicationGuildCommands(clientId, config.guildId),
          { body: [] }
        );
      }
    }
  } catch (error) {
    console.error("[Deploy] Failed to deploy commands:", error);
    process.exit(1);
  }
}

deploy();
