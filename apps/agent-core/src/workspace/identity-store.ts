import { readFile, writeFile } from "node:fs/promises";

import { IDENTITY_FILE } from "./paths.js";

const MAX_IDENTITY_LENGTH = 32_000;

export class IdentityStore {
  constructor(private readonly identityPath: string) {}

  async read(): Promise<string> {
    return readFile(this.identityPath, "utf-8");
  }

  async write(content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new Error("identity content must not be empty");
    }
    if (trimmed.length > MAX_IDENTITY_LENGTH) {
      throw new Error(
        `identity content exceeds maximum length (${MAX_IDENTITY_LENGTH})`,
      );
    }
    await writeFile(this.identityPath, `${trimmed}\n`, "utf-8");
  }

  get fileName(): string {
    return IDENTITY_FILE;
  }
}
