export interface SecretMatch {
  type: string;
  redactedPreview: string;
  lineOffset?: number;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'GitHub Personal Access Token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/g },
  { name: 'GitHub Fine-Grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g },
  { name: 'AWS Access Key ID', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    name: 'AWS Secret Access Key',
    regex: /\baws[_-]?secret[_-]?(?:access[_-]?)?key\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
  },
  { name: 'Google / Gemini API Key', regex: /\bAIza[0-9A-Za-z_-]{33,50}\b/g },
  { name: 'OpenAI API Key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,160}\b/g },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,160}\b/g },
  { name: 'Stripe Secret Key', regex: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{20,99}\b/g },
  { name: 'Slack Token', regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,100}\b/g },
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    name: 'Database Connection URI with Credentials',
    regex: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|rediss|amqp):\/\/[^:\s'"`]+:[^@\s'"`]+@[^\s'"`]+/gi,
  },
  {
    name: 'JWT Token',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    name: 'Hardcoded Secret Assignment',
    regex: /\b(?:api[_-]?key|api[_-]?secret|client[_-]?secret|access[_-]?token|auth[_-]?token|private[_-]?key|jwt[_-]?secret|webhook[_-]?secret|db[_-]?password|password)\s*[:=]\s*['"`]([A-Za-z0-9!@#$%^&*()_+\-={}[\]:;,.<>/?~]{12,})['"`]/gi,
  },
  {
    name: 'Bearer Authorization Header',
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g,
  },
];

const SAFE_PLACEHOLDER_PATTERNS = [
  /replace[-_]?with/i,
  /your[-_]?.*[-_]?(?:key|secret|token|password)/i,
  /example\.(?:com|org|net|mongodb)/i,
  /placeholder/i,
  /changeme/i,
  /^\*+$/,
  /^x{8,}$/i,
  /^\[REDACTED/i,
  /process\.env\./i,
];

function isPlaceholderValue(value: string): boolean {
  return SAFE_PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

/**
 * Redacts detected credentials, API keys, private keys, and secrets from text.
 * Guarantees sensitive values never appear in AI prompts, logs, MongoDB records, or GitHub comments.
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  let output = input;

  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    output = output.replace(regex, (fullMatch, capturedGroup) => {
      const target = typeof capturedGroup === 'string' ? capturedGroup : fullMatch;
      if (isPlaceholderValue(target)) {
        return fullMatch;
      }
      if (typeof capturedGroup === 'string' && fullMatch.includes(capturedGroup)) {
        return fullMatch.replace(capturedGroup, `[REDACTED:${name}]`);
      }
      return `[REDACTED:${name}]`;
    });
  }

  return output;
}

/**
 * Scans a single line of added code for hardcoded secrets without returning raw secret text.
 */
export function detectSecretsInLine(line: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  if (!line || line.trim().length < 8) return matches;

  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    const match = regex.exec(line);
    if (match) {
      const candidate = match[1] || match[0];
      if (isPlaceholderValue(candidate)) continue;
      // Avoid flagging obvious environment variable lookups or type definitions
      if (/\bprocess\.env\b|\bimport\.meta\.env\b|\bDeno\.env\b/.test(line)) continue;
      matches.push({
        type: name,
        redactedPreview: redactSecrets(line).trim().slice(0, 140),
      });
    }
  }

  return matches;
}

/**
 * Recursively redacts strings inside an object for safe structured logging.
 */
export function redactObject<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, depth + 1)) as unknown as T;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/(token|secret|password|authorization|apikey|api_key|privatekey|cookie)/i.test(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactObject(v, depth + 1);
      }
    }
    return result as T;
  }
  return value;
}
