import crypto from 'crypto';
import { env } from '../config/env';
import { User, IUser } from '../models';
import { GitHubClient } from '../integrations/github/githubClient';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { signOAuthState, signSessionToken, verifyOAuthState } from '../utils/jwt';
import { AuthenticationError, ServiceUnavailableError } from '../utils/errors';
import { recordActivity } from './notificationService';

export function buildGitHubAuthorizationUrl(returnTo = '/'): {
  url: string;
  nonce: string;
} {
  if (!env.isGitHubOAuthConfigured) {
    throw new ServiceUnavailableError(
      'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend/.env.'
    );
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  const state = signOAuthState(nonce, safeReturnTo);

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    // Least-privilege scopes needed for reading repos/PRs, creating PR webhooks, and posting review comments
    scope: 'read:user user:email repo',
    state,
    allow_signup: 'true',
  });

  return {
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    nonce,
  };
}

export async function handleGitHubOAuthCallback(params: {
  code: string;
  state: string;
  expectedNonce?: string;
}): Promise<{ user: IUser; sessionToken: string; returnTo: string }> {
  const verifiedState = verifyOAuthState(params.state);
  if (!verifiedState) {
    throw new AuthenticationError('Invalid or expired OAuth state parameter');
  }
  if (!params.expectedNonce || verifiedState.nonce !== params.expectedNonce) {
  throw new AuthenticationError('OAuth CSRF nonce mismatch');
  }

  const { accessToken } = await GitHubClient.exchangeOAuthCode(params.code);
  const gh = new GitHubClient(accessToken);
  const profile = await gh.getAuthenticatedUser();

  const encryptedToken = encryptSecret(accessToken);

  const existingCount = await User.countDocuments();
  const user = await User.findOneAndUpdate(
    { githubId: String(profile.id) },
    {
      $set: {
        name: profile.name || profile.login,
        email: profile.email || '',
        githubUsername: profile.login,
        githubAccessTokenEncrypted: encryptedToken,
        githubConnected: true,
        avatarUrl: profile.avatar_url || '',
      },
      $setOnInsert: {
        githubId: String(profile.id),
        role: existingCount === 0 ? 'admin' : 'developer',
      },
    },
    { upsert: true, new: true }
  );

  await recordActivity({
    userId: user._id,
    eventType: 'auth.connected',
    description: `Connected GitHub account @${user.githubUsername}`,
    metadata: { githubUsername: user.githubUsername },
  });

  const sessionToken = signSessionToken({
    userId: String(user._id),
    githubId: user.githubId,
    githubUsername: user.githubUsername,
    role: user.role,
  });

  return {
    user,
    sessionToken,
    returnTo: verifiedState.returnTo || '/',
  };
}

export async function getUserDecryptedGitHubToken(userId: string): Promise<string> {
  const user = await User.findById(userId).select('+githubAccessTokenEncrypted');
  if (!user || !user.githubConnected || !user.githubAccessTokenEncrypted) {
    throw new AuthenticationError(
      'GitHub account is disconnected. Reconnect GitHub OAuth in Settings to perform GitHub actions.'
    );
  }
  return decryptSecret(user.githubAccessTokenEncrypted);
}

export async function disconnectGitHubAccount(userId: string): Promise<void> {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        githubAccessTokenEncrypted: '',
        githubConnected: false,
      },
    },
    { new: true }
  );

  if (user) {
    await recordActivity({
      userId: user._id,
      eventType: 'auth.disconnected',
      description: `Disconnected GitHub account @${user.githubUsername}`,
    });
  }
}
