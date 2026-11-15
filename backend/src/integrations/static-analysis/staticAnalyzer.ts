import { AgentFindingInput } from '../../types';
import { ParsedFileDiff } from '../../utils/diffParser';
import { detectSecretsInLine, redactSecrets } from '../../utils/secretRedactor';
import { logger } from '../../utils/logger';

interface StaticSecurityRule {
  id: string;
  title: string;
  severity: AgentFindingInput['severity'];
  category: AgentFindingInput['category'];
  regex: RegExp;
  description: string;
  impact: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
  confidenceScore: number;
}

const STATIC_RULES: StaticSecurityRule[] = [
  {
    id: 'dangerous-eval',
    title: 'Dynamic Code Execution via eval() or new Function()',
    severity: 'HIGH',
    category: 'security',
    regex: /\b(?:eval\s*\(|new\s+Function\s*\()/,
    description:
      'Code invokes dynamic JavaScript evaluation (`eval` or `new Function`), which executes arbitrary strings as code.',
    impact:
      'If any attacker-controlled input reaches this call, it leads to Arbitrary Code Execution (RCE) or Cross-Site Scripting (XSS).',
    recommendation:
      'Eliminate dynamic code execution. Use structured parsers (`JSON.parse`), explicit lookup maps, or safe expression evaluators.',
    cwe: 'CWE-95',
    owasp: 'A03:2021 Injection',
    confidenceScore: 0.9,
  },
  {
    id: 'command-injection-exec',
    title: 'Potential OS Command Injection in Child Process Call',
    severity: 'CRITICAL',
    category: 'security',
    regex: /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|['"][^'"]*['"]\s*\+)/,
    description:
      'Shell command string is constructed via template interpolation or string concatenation inside `exec`/`execSync`.',
    impact:
      'An attacker who controls any interpolated value can inject shell metacharacters (`;`, `&&`, `|`, `$()`) and execute arbitrary OS commands.',
    recommendation:
      'Replace `exec`/`execSync` with `execFile`/`spawn` passing an argument array (`shell: false`), and strictly validate inputs.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    confidenceScore: 0.92,
  },
  {
    id: 'tls-verification-disabled',
    title: 'TLS Certificate Verification Disabled (`rejectUnauthorized: false`)',
    severity: 'HIGH',
    category: 'security',
    regex: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/,
    description:
      'TLS certificate validation is explicitly disabled, allowing untrusted or self-signed certificates.',
    impact:
      'Exposes outbound HTTPS/database connections to Man-in-the-Middle (MitM) interception and credential theft.',
    recommendation:
      'Remove `rejectUnauthorized: false` and trust proper CA certificates via `NODE_EXTRA_CA_CERTS` or platform trust stores.',
    cwe: 'CWE-295',
    owasp: 'A02:2021 Cryptographic Failures',
    confidenceScore: 0.95,
  },
  {
    id: 'nosql-where-operator',
    title: 'Dangerous MongoDB `$where` Operator Usage',
    severity: 'HIGH',
    category: 'security',
    regex: /['"]?\$where['"]?\s*:/,
    description:
      'The MongoDB `$where` operator executes JavaScript on the database server and is a primary vector for NoSQL Injection.',
    impact:
      'Enables NoSQL injection, arbitrary server-side JavaScript execution, and severe query performance degradation.',
    recommendation:
      'Replace `$where` with standard MongoDB query operators (`$eq`, `$in`, `$expr`) and validate inputs with a schema validator.',
    cwe: 'CWE-943',
    owasp: 'A03:2021 Injection',
    confidenceScore: 0.88,
  },
  {
    id: 'react-dangerous-html',
    title: 'Unsanitized `dangerouslySetInnerHTML` Sink Detected',
    severity: 'HIGH',
    category: 'security',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*(?!DOMPurify\.sanitize|sanitizeHtml)/,
    description:
      'React `dangerouslySetInnerHTML` is used without an explicit HTML sanitizer such as DOMPurify.',
    impact:
      'If the HTML string contains untrusted or user-derived content, attackers can execute persistent or reflected XSS payloads.',
    recommendation:
      'Avoid `dangerouslySetInnerHTML` or sanitize the value immediately before rendering using `DOMPurify.sanitize(html)`.',
    cwe: 'CWE-79',
    owasp: 'A03:2021 Injection',
    confidenceScore: 0.82,
  },
  {
    id: 'sql-string-interpolation',
    title: 'Potential SQL Injection via String Interpolation in Query',
    severity: 'CRITICAL',
    category: 'security',
    regex: /\.(?:query|execute)\s*\(\s*`[^`]*(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/i,
    description:
      'A SQL statement is built using template literal interpolation directly inside a database query call.',
    impact:
      'Allows attackers to manipulate query logic, exfiltrate sensitive database tables, or corrupt/delete data.',
    recommendation:
      'Use parameterized queries / prepared statements with bound placeholders instead of string interpolation.',
    cwe: 'CWE-89',
    owasp: 'A03:2021 Injection',
    confidenceScore: 0.9,
  },
];

/**
 * Checks added dependencies in a modified `package.json` against the live OSV.dev vulnerability API.
 */
async function checkPackageJsonVulnerabilities(
  file: ParsedFileDiff
): Promise<AgentFindingInput[]> {
  const findings: AgentFindingInput[] = [];
  const addedPackages: Array<{ name: string; version: string; line: number; raw: string }> = [];

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type !== 'add' || !line.newLineNumber) continue;
      const depMatch = line.content.match(/^\s*"(@?[a-z0-9._/-]+)"\s*:\s*"[\^~]?(\d+\.\d+\.\d+[^"]*)"/i);
      if (depMatch) {
        const [, name, version] = depMatch;
        // Skip metadata keys like "version", "node"
        if (['version', 'node', 'npm'].includes(name)) continue;
        addedPackages.push({ name, version, line: line.newLineNumber, raw: line.content.trim() });
      }
    }
  }

  if (addedPackages.length === 0) return findings;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        queries: addedPackages.map((pkg) => ({
          package: { name: pkg.name, ecosystem: 'npm' },
          version: pkg.version,
        })),
      }),
    });
    clearTimeout(timer);

    if (!response.ok) return findings;
    const data = (await response.json()) as {
      results?: Array<{ vulns?: Array<{ id: string; summary?: string }> }>;
    };

    const results = data.results || [];
    results.forEach((res, idx) => {
      const vulns = res.vulns || [];
      if (vulns.length === 0) return;
      const pkg = addedPackages[idx];
      const ids = vulns.slice(0, 3).map((v) => v.id).join(', ');
      findings.push({
        title: `Known Vulnerable npm Dependency: ${pkg.name}@${pkg.version}`,
        severity: 'HIGH',
        category: 'security',
        description: `Package \`${pkg.name}@${pkg.version}\` matches ${vulns.length} known security advisory record(s) in OSV (${ids}).`,
        impact:
          'Introducing a dependency with published CVEs/advisories exposes the application to known supply-chain exploits.',
        recommendation: `Upgrade \`${pkg.name}\` to the latest patched version and verify with \`npm audit\`.`,
        filePath: file.filename,
        startLine: pkg.line,
        endLine: pkg.line,
        codeSnippet: pkg.raw,
        confidenceScore: 0.96,
        owasp: 'A06:2021 Vulnerable and Outdated Components',
        cwe: 'CWE-1104',
        agentSource: 'static-analysis',
      });
    });
  } catch (err) {
    logger.debug('OSV dependency vulnerability check skipped/timed out', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return findings;
}

/**
 * Deterministic security & static analysis pass (Step 6 of review workflow).
 * Runs across added lines only, redacts any discovered secrets, and validates dependency advisories.
 */
export async function runStaticAnalysis(
  parsedFiles: ParsedFileDiff[]
): Promise<AgentFindingInput[]> {
  const findings: AgentFindingInput[] = [];

  for (const file of parsedFiles) {
    if (file.status === 'removed' || file.changedLines.size === 0) continue;

    // Skip test/fixture files for low-signal pattern rules, still scan for real secrets
    const isTestFile = /(?:^|\/)(?:__tests__|tests?|spec)\/|(?:\.test|\.spec)\.[jt]sx?$/i.test(
      file.filename
    );

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== 'add' || !line.newLineNumber) continue;

        // 1. Secret detection (always active, always redacts raw secret values!)
        const secretHits = detectSecretsInLine(line.content);
        for (const hit of secretHits) {
          findings.push({
            title: `Hardcoded Secret Detected (${hit.type})`,
            severity: 'CRITICAL',
            category: 'security',
            description: `A value matching a ${hit.type} appears to be hardcoded directly in source code. The sensitive value has been redacted.`,
            impact:
              'Exposed credentials in Git history can be harvested immediately by automated scanners, leading to full account or infrastructure compromise.',
            recommendation:
              'Remove the credential from source code immediately, revoke/rotate the compromised secret, and load it exclusively from environment variables or a secret manager.',
            filePath: file.filename,
            startLine: line.newLineNumber,
            endLine: line.newLineNumber,
            codeSnippet: hit.redactedPreview,
            suggestedFix: '// Load credentials from environment variables instead of hardcoding\nconst secret = process.env.SERVICE_SECRET;',
            confidenceScore: 0.97,
            cwe: 'CWE-798',
            owasp: 'A07:2021 Identification and Authentication Failures',
            agentSource: 'static-analysis',
          });
        }

        // 2. High-confidence dangerous sink rules (skip comments & test mocks)
        const trimmed = line.content.trim();
        if (
          !isTestFile &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('#')
        ) {
          for (const rule of STATIC_RULES) {
            if (rule.regex.test(line.content)) {
              findings.push({
                title: rule.title,
                severity: rule.severity,
                category: rule.category,
                description: rule.description,
                impact: rule.impact,
                recommendation: rule.recommendation,
                filePath: file.filename,
                startLine: line.newLineNumber,
                endLine: line.newLineNumber,
                codeSnippet: redactSecrets(line.content.trim()).slice(0, 200),
                confidenceScore: rule.confidenceScore,
                cwe: rule.cwe,
                owasp: rule.owasp,
                agentSource: 'static-analysis',
              });
            }
          }
        }
      }
    }

    // 3. Dependency vulnerability check on modified package.json files
    if (file.filename.endsWith('package.json')) {
      const depFindings = await checkPackageJsonVulnerabilities(file);
      findings.push(...depFindings);
    }
  }

  return findings;
}
