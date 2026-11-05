import { BotEvent } from "../types/index.js";
import { readyEvent } from "./ready.js";
import { interactionCreateEvent } from "./interactionCreate.js";
import { messageCreateEvent } from "./messageCreate.js";

export const events: BotEvent<any>[] = [
  readyEvent,
  interactionCreateEvent,
  messageCreateEvent
];
