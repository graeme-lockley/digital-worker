export type WikiFrontMatter = {
  title: string;
  updatedBy: string;
  updatedAt: string;
  revision: number;
};

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontMatter(raw: string): {
  frontMatter: WikiFrontMatter | null;
  body: string;
} {
  const match = raw.match(FRONT_MATTER_RE);
  if (!match) {
    return { frontMatter: null, body: raw };
  }

  const yamlBlock = match[1] ?? "";
  const body = match[2] ?? "";
  const fields = parseSimpleYaml(yamlBlock);

  const title = fields.title?.trim() ?? "";
  const updatedBy = fields.updated_by?.trim() ?? fields.updatedBy?.trim() ?? "";
  const updatedAt = fields.updated_at?.trim() ?? fields.updatedAt?.trim() ?? "";
  const revisionRaw = fields.revision?.trim() ?? "0";
  const revision = Number(revisionRaw);

  if (!title || !updatedBy || !updatedAt || !Number.isInteger(revision)) {
    return { frontMatter: null, body: raw };
  }

  return {
    frontMatter: { title, updatedBy, updatedAt, revision },
    body,
  };
}

export function serializePage(
  frontMatter: WikiFrontMatter,
  body: string,
): string {
  const yaml = [
    "---",
    `title: ${escapeYamlScalar(frontMatter.title)}`,
    `updated_by: ${escapeYamlScalar(frontMatter.updatedBy)}`,
    `updated_at: ${escapeYamlScalar(frontMatter.updatedAt)}`,
    `revision: ${frontMatter.revision}`,
    "---",
    "",
  ].join("\n");
  const trimmedBody = body.replace(/^\n+/, "");
  return `${yaml}${trimmedBody}`;
}

function parseSimpleYaml(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon < 1) {
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function escapeYamlScalar(value: string): string {
  if (/^[a-zA-Z0-9_./:@ -]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
