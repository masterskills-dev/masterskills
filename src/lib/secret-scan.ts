/**
 * Client-side pre-scan — catches secrets BEFORE anything leaves the machine.
 * The server runs the authoritative scan on complete; keep both pattern sets
 * in sync (cloud/src/lib/secret-scan.ts).
 */

export interface ScanFinding {
  file: string;
  kind: string;
  detail: string;
}

/** Files excluded from packages automatically (and reported to the user). */
export function isSecretFilePath(path: string): string | null {
  if (/(^|\/)\.env(\..+)?$/.test(path) && !path.endsWith(".env.example")) {
    return "environment file";
  }
  if (/\.(pem|p12|pfx|key)$/.test(path) || /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/.test(path)) {
    return "private key file";
  }
  if (/(^|\/)(credentials\.json|service-account.*\.json|\.netrc|\.npmrc)$/.test(path)) {
    return "credential file";
  }
  if (/(^|\/)config\.local\.[^/]+$/.test(path)) {
    return "local config file";
  }
  return null;
}

const CONTENT_PATTERNS: { kind: string; detail: string; regex: RegExp }[] = [
  { kind: "private_key", detail: "Private key block", regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY/ },
  { kind: "aws_key", detail: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "github_token", detail: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { kind: "slack_token", detail: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "google_key", detail: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "anthropic_key", detail: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { kind: "openai_key", detail: "OpenAI-style secret key", regex: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { kind: "masterskills_token", detail: "MasterSkills device token", regex: /\bmsk_[A-Za-z0-9_-]{20,}\b/ },
  {
    kind: "connection_string",
    detail: "Connection string with embedded credentials",
    regex: /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s:@'"]+:[^\s@'"]+@/,
  },
  {
    kind: "generic_secret",
    detail: "Hardcoded secret assignment",
    regex: /(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  },
];

export function isProbablyText(buffer: Buffer): boolean {
  return !buffer.subarray(0, 8192).includes(0);
}

export function scanContent(path: string, content: Buffer): ScanFinding[] {
  if (content.length > 1024 * 1024 || !isProbablyText(content)) return [];
  const text = content.toString("utf8");
  const findings: ScanFinding[] = [];
  for (const pattern of CONTENT_PATTERNS) {
    if (pattern.regex.test(text)) {
      findings.push({ file: path, kind: pattern.kind, detail: pattern.detail });
    }
  }
  return findings;
}
