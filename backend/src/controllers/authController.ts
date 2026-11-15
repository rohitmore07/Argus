import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { SESSION_COOKIE_NAME } from '../middleware/auth';
import {
  buildGitHubAuthorizationUrl,
  disconnectGitHubAccount,
  handleGitHubOAuthCallback,
} from '../services/authService';
import { AuthenticationError } from '../utils/errors';

const OAUTH_NONCE_COOKIE = 'pr_sentinel_oauth_nonce';

const nonceCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE,
  path: '/',
};

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.COOKIE_SECURE,
  path: '/',
};

function frontendUrl(path: string): string {
  return new URL(path, env.FRONTEND_URL).toString();
}

function safeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  return value;
}

export async function startGitHubOAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const returnTo = typeof req.query.returnTo === 'string' ? safeReturnPath(req.query.returnTo) : '/';
    const { url, nonce } = buildGitHubAuthorizationUrl(returnTo);

    res.cookie(OAUTH_NONCE_COOKIE, nonce, {
      ...nonceCookieOptions,
      maxAge: 10 * 60 * 1000,
    });

    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

export async function githubOAuthCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // The nonce cookie is single-use, so clear it on every outcome.
  res.clearCookie(OAUTH_NONCE_COOKIE, nonceCookieOptions);

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  if (oauthError) {
    res.redirect(frontendUrl(`/?authError=${encodeURIComponent(oauthError)}`));
    return;
  }

  try {
    if (!code || !state) {
      throw new AuthenticationError('Missing GitHub OAuth code or state parameter');
    }

    const expectedNonce = req.cookies?.[OAUTH_NONCE_COOKIE] as string | undefined;
    const { sessionToken, returnTo } = await handleGitHubOAuthCallback({
      code,
      state,
      expectedNonce,
    });

    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      ...sessionCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(frontendUrl(safeReturnPath(returnTo)));
  } catch (err) {
    if (err instanceof AuthenticationError) {
      console.warn('GitHub OAuth failed:', err.message);
      res.redirect(frontendUrl('/?authError=github_auth_failed'));
      return;
    }
    next(err);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
  res.json({ success: true, message: 'Signed out successfully' });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  res.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      githubId: user.githubId,
      githubUsername: user.githubUsername,
      githubConnected: user.githubConnected,
      avatarUrl: user.avatarUrl,
      role: user.role,
      defaultReviewSettings: user.defaultReviewSettings,
      aiPreferences: user.aiPreferences,
      notificationPreferences: user.notificationPreferences,
      createdAt: user.createdAt,
    },
  });
}

export async function disconnectGitHub(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await disconnectGitHubAccount(String(req.user!._id));
    res.json({
      success: true,
      message: 'GitHub credentials removed. Reconnect via GitHub OAuth to resume automated reviews.',
    });
  } catch (err) {
    next(err);
  }
}