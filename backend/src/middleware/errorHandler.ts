import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { redactSecrets } from '../utils/secretRedactor';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Operational server error', {
        path: req.originalUrl,
        method: req.method,
        code: err.code,
        message: err.message,
      });
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: redactSecrets(err.message),
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Handle MongoDB duplicate key errors cleanly
  const mongoErr = err as { code?: number; keyValue?: Record<string, unknown>; message?: string };
  if (mongoErr && mongoErr.code === 11000) {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A record with the same unique key already exists.',
      },
    });
    return;
  }

  const rawMessage = err instanceof Error ? err.message : 'Unexpected internal error';
  logger.error('Unhandled application error', {
    path: req.originalUrl,
    method: req.method,
    error: rawMessage,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected internal error occurred'
          : redactSecrets(rawMessage),
    },
  });
}
