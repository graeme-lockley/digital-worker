import type { Command } from "commander";

import { parseAllowedChatIds } from "./adapter.js";
import { loadTelegramBots as loadBots } from "./telegram-bot-config.js";
import type { TelegramBotDefinition } from "./bot-registry.js";

export function loadTelegramBots(
  program: Command,
  allowedChatIds: Set<string>,
  options?: { botsFile?: string; botsJson?: string },
): TelegramBotDefinition[] {
  return loadBots({ program, allowedChatIds, ...options });
}

export { parseAllowedChatIds };
