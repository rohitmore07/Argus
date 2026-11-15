import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { ExternalServiceError } from '../../utils/errors';

/**
 * Generates a short-lived RS256 JWT for GitHub App authentication (valid for 9 minutes).
 */
export function createGitHubAppJwt(): string {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new ExternalServiceError(
      'GitHub App',
      'GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be configured'
    );
  }

  const privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now - 60,
      exp: now + 9 * 60,
      iss: env.GITHUB_APP_ID,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

/**
 * Exchanges a GitHub App JWT for an Installation Access Token scoped to a specific installation.
 */
export async function getGitHubAppInstallationToken(installationId: number): Promise<{
  token: string;
  expiresAt: string;
}> {
  const appJwt = createGitHubAppJwt();
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${appJwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PR-Sentinel/1.0',
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ExternalServiceError(
      'GitHub App',
      `Failed to generate installation access token (${response.status}): ${body.slice(0, 200)}`,
      response.status
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  return { token: data.token, expiresAt: data.expires_at };
}
