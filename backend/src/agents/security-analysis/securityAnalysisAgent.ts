import { BaseReviewAgent } from '../baseAgent';

export class SecurityAnalysisAgent extends BaseReviewAgent {
  readonly agentSource = 'security-analysis' as const;
  readonly category = 'security' as const;
  readonly roleDescription = 'Security Analysis Agent (Principal Application Security Engineer)';
  readonly focusChecklist = [
    'SQL Injection and NoSQL Injection (unsanitized MongoDB operators like $where/$regex/$ne from req.body/req.query)',
    'Cross-Site Scripting (XSS) — unsafe HTML injection, unescaped user data, unsafe href/javascript: URLs',
    'Cross-Site Request Forgery (CSRF) — missing state verification, unsafe cookie SameSite/HttpOnly/Secure attributes',
    'Broken authentication — weak session handling, JWT verification flaws (alg:none, missing expiry), timing attacks on secret comparison',
    'Authorization and access control vulnerabilities — missing ownership checks, privilege escalation, RBAC bypasses',
    'Insecure Direct Object References (IDOR) — fetching/modifying records by user-supplied ID without verifying ownership/tenant scope',
    'Hardcoded API keys, credentials, private keys, and secrets (NEVER output the raw secret — always write [REDACTED])',
    'Sensitive information exposure — leaking tokens, password hashes, stack traces, or PII in logs or API responses',
    'Insecure file uploads, path traversal (../), and arbitrary file read/write',
    'Command injection (child_process exec/spawn with shell), template injection, and code injection (eval/Function)',
    'Server-Side Request Forgery (SSRF) — fetching arbitrary user-supplied URLs without allowlists or private-IP blocking',
    'Insecure cryptographic practices — MD5/SHA1 for passwords, weak RNG (Math.random for tokens), ECB mode, hardcoded IVs',
    'Insecure configurations — permissive CORS with credentials, disabled TLS verification, debug mode in prod, unsafe dependencies',
    'Prioritize real-world exploitability and include CWE and OWASP Top 10 classifications when applicable',
  ];
}
