import { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  loadTelegramBots,
  normalizeTelegramBootstrap,
  parseTelegramBotConfigEntries,
  resolveTelegramBotDefinitions,
} from "./telegram-bot-config.js";

describe("parseTelegramBotConfigEntries", () => {
  it("parses a valid config array", () => {
    const entries = parseTelegramBotConfigEntries([
      {
        botId: "aidadigitalbot",
        tokenEnv: "TELEGRAM_AIDADIGITALBOT_TOKEN",
        agentCoreUrl: "http://agent-core-aida:3000",
      },
      {
        botId: "riaandigitalbot",
        token: "inline-test-token",
        agentCoreUrl: "http://agent-core-riaan:3000",
      },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[1]?.token).toBe("inline-test-token");
  });

  it("rejects duplicate bot ids", () => {
    expect(() =>
      parseTelegramBotConfigEntries([
        { botId: "dup", token: "a", agentCoreUrl: "http://127.0.0.1:1" },
        { botId: "dup", token: "b", agentCoreUrl: "http://127.0.0.1:2" },
      ]),
    ).toThrow(/duplicate botId/);
  });
});

describe("resolveTelegramBotDefinitions", () => {
  it("resolves tokenEnv from the environment", () => {
    const previous = process.env.MY_BOT_TOKEN;
    process.env.MY_BOT_TOKEN = "secret";

    const bots = resolveTelegramBotDefinitions(
      [
        {
          botId: "mybot",
          tokenEnv: "MY_BOT_TOKEN",
          agentCoreUrl: "http://127.0.0.1:3000",
        },
      ],
      new Set(["123"]),
    );

    expect(bots[0]?.token).toBe("secret");
    expect(bots[0]?.allowedChatIds).toEqual(new Set(["123"]));

    if (previous === undefined) {
      delete process.env.MY_BOT_TOKEN;
    } else {
      process.env.MY_BOT_TOKEN = previous;
    }
  });
});

describe("loadTelegramBots", () => {
  it("loads bots from GATEWAY_TELEGRAM_BOTS json", () => {
    const previousJson = process.env.GATEWAY_TELEGRAM_BOTS;
    const previousFile = process.env.GATEWAY_TELEGRAM_BOTS_FILE;
    delete process.env.GATEWAY_TELEGRAM_BOTS_FILE;
    process.env.GATEWAY_TELEGRAM_BOTS = JSON.stringify([
      {
        botId: "fromenv",
        token: "tok",
        agentCoreUrl: "http://127.0.0.1:3000",
      },
    ]);

    const program = new Command();
    program.exitOverride();
    const bots = loadTelegramBots({
      program,
      allowedChatIds: new Set(["1"]),
    });

    expect(bots).toHaveLength(1);
    expect(bots[0]?.botId).toBe("fromenv");

    if (previousJson === undefined) {
      delete process.env.GATEWAY_TELEGRAM_BOTS;
    } else {
      process.env.GATEWAY_TELEGRAM_BOTS = previousJson;
    }
    if (previousFile === undefined) {
      delete process.env.GATEWAY_TELEGRAM_BOTS_FILE;
    } else {
      process.env.GATEWAY_TELEGRAM_BOTS_FILE = previousFile;
    }
  });
});

describe("normalizeTelegramBootstrap", () => {
  it("assigns legacy bot id and offset to the first configured bot", () => {
    const normalized = normalizeTelegramBootstrap(
      {
        messages: [{ text: "hi" } as { botId?: string }],
        correlations: {
          "telegram:1": {},
        },
        telegramOffsets: { __legacy__: 42 },
      },
      [
        {
          botId: "aidadigitalbot",
          token: "t",
          agentCoreUrl: "http://127.0.0.1:3000",
          allowedChatIds: new Set(["1"]),
        },
      ],
    );

    expect(normalized.messages[0]?.botId).toBe("aidadigitalbot");
    expect(normalized.correlations["telegram:1"]?.botId).toBe("aidadigitalbot");
    expect(normalized.telegramOffsets.aidadigitalbot).toBe(42);
    expect(normalized.telegramOffsets.__legacy__).toBeUndefined();
  });
});
