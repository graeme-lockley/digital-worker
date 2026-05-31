import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { repoWorkspacePath } from "../test-helpers.js";
import { buildSystemPrompt, extractPurposeFromMandate, loadWorkspace } from "./index.js";
import { MANDATE_FILE, SOUL_FILE, IDENTITY_FILE, USER_FILE } from "./paths.js";

describe("loadWorkspace", () => {
  it("loads seeded Aida workspace from repo", async () => {
    const loaded = await loadWorkspace({
      agentName: "Aida",
      workspaceDir: repoWorkspacePath(),
    });

    expect(loaded.identity.mandate).toContain("Aida");
    expect(loaded.identity.soul).toContain("Helpfulness");
    expect(loaded.identity.identity).toContain("Self-knowledge");
  });

  it("throws when required files are missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-workspace-"));
    try {
      await expect(
        loadWorkspace({ agentName: "missing", workspaceDir: dir }),
      ).rejects.toThrow(/MANDATE\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("buildSystemPrompt", () => {
  it("includes mandate soul and identity sections", async () => {
    const loaded = await loadWorkspace({
      agentName: "Aida",
      workspaceDir: repoWorkspacePath(),
    });
    const prompt = buildSystemPrompt(loaded.identity);
    expect(prompt).toContain("# Mandate (immutable)");
    expect(prompt).toContain("# Soul (immutable)");
    expect(prompt).toContain("# Identity");
    expect(prompt).toContain("# User");
    expect(prompt).toContain("Graeme");
  });
});

describe("extractPurposeFromMandate", () => {
  it("returns first substantive paragraph", () => {
    const purpose = extractPurposeFromMandate(
      "# Title\n\nYou are the core agent.\n\n## More",
    );
    expect(purpose).toBe("You are the core agent.");
  });
});

describe("identity store", () => {
  it("writes identity file in temp workspace", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-workspace-"));
    try {
      await writeFile(path.join(dir, MANDATE_FILE), "# M\n\nMandate text.");
      await writeFile(path.join(dir, SOUL_FILE), "# S\n\nSoul text.");
      await writeFile(path.join(dir, IDENTITY_FILE), "# I\n\nOld identity.");
      await writeFile(path.join(dir, USER_FILE), "# U\n\nOld user.");

      const loaded = await loadWorkspace({
        agentName: "test",
        workspaceDir: dir,
      });
      await loaded.identityStore.write("# I\n\nNew identity.");
      const reloaded = await loadWorkspace({
        agentName: "test",
        workspaceDir: dir,
      });
      expect(reloaded.identity.identity).toContain("New identity");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
