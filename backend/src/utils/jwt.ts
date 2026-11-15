import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../types';

export interface SessionTokenPayload {
  userId: string;
  githubId: string;
  githubUsername: string;
  role: UserRole;
  type: 'session';
}

export interface OAuthStatePayload {
  nonce: string;
  returnTo: string;
  type: 'oauth_state';
}

const SESSION_TTL = '7d';
const OAUTH_STATE_TTL = '10m';

export function signSessionToken(payload: Omit<SessionTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'session' }, env.JWT_SECRET, {
    expiresIn: SESSION_TTL,
    issuer: 'pr-sentinel',
  });
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'pr-sentinel',
    }) as SessionTokenPayload;
    if (decoded.type !== 'session' || !decoded.userId) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function signOAuthState(nonce: string, returnTo = '/'): string {
  return jwt.sign({ nonce, returnTo, type: 'oauth_state' }, env.JWT_SECRET, {
    expiresIn: OAUTH_STATE_TTL,
    issuer: 'pr-sentinel',
  });
}

export function verifyOAuthState(stateToken: string): OAuthStatePayload | null {
  try {
    const decoded = jwt.verify(stateToken, env.JWT_SECRET, {
      issuer: 'pr-sentinel',
    }) as OAuthStatePayload;
    if (decoded.type !== 'oauth_state' || !decoded.nonce) return null;
    return decoded;
  } catch {
    return null;
  }
}
