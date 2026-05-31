export type SecretScanResult = {
  text: string;
  redacted: boolean;
  matches: string[];
};

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "aws_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  {
    name: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "generic_api_key",
    pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9\-._~+/]{8,}/gi,
  },
];

/** Scan and redact likely secrets before persisting to memory files. */
export function scanAndRedactSecrets(input: string): SecretScanResult {
  let text = input;
  const matches: string[] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      matches.push(name);
      pattern.lastIndex = 0;
      text = text.replace(pattern, `[REDACTED:${name}]`);
    }
  }

  return {
    text,
    redacted: matches.length > 0,
    matches,
  };
}
