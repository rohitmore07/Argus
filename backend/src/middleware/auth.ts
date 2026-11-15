import { NextFunction, Request, Response } from 'express';
import { getDatabaseStatus } from '../config/database';
import { User, IUser } from '../models';
import { UserRole } from '../types';
import {
  AuthenticationError,
  ForbiddenError,
  ServiceUnavailableError,
} from '../utils/errors';
import { verifySessionToken } from '../utils/jwt';

export const SESSION_COOKIE_NAME = 'pr_sentinel_session';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      rawBody?: Buffer;
    }
  }
}

export function requireDatabase(_req: Request, _res: Response, next: NextFunction): void {
  const status = getDatabaseStatus();
  if (!status.connected) {
    next(
      new ServiceUnavailableError(
        'MongoDB is not connected. Configure MONGODB_URI in backend/.env and restart the server.',
        { service: 'mongodb', error: status.error }
      )
    );
    return;
  }
  next();
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const db = getDatabaseStatus();
    if (!db.connected) {
      throw new ServiceUnavailableError(
        'MongoDB is not connected. Configure MONGODB_URI in backend/.env.'
      );
    }

    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

    const token = cookieToken || bearerToken;
    if (!token) {
      throw new AuthenticationError('Authentication required. Please sign in with GitHub.');
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      throw new AuthenticationError('Session expired or invalid. Please sign in again.');
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      throw new AuthenticationError('User account not found');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError(`Requires one of roles: ${allowedRoles.join(', ')}`));
      return;
    }
    next();
  };
}
