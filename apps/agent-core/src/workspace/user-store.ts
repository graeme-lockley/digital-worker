import { readFile, writeFile } from "node:fs/promises";

import { USER_FILE } from "./paths.js";

const MAX_USER_LENGTH = 32_000;

export class UserStore {
  constructor(private readonly userPath: string) {}

  async read(): Promise<string> {
    return readFile(this.userPath, "utf-8");
  }

  async write(content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new Error("user content must not be empty");
    }
    if (trimmed.length > MAX_USER_LENGTH) {
      throw new Error(
        `user content exceeds maximum length (${MAX_USER_LENGTH})`,
      );
    }
    await writeFile(this.userPath, `${trimmed}\n`, "utf-8");
  }

  get fileName(): string {
    return USER_FILE;
  }
}
