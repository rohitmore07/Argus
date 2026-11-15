import { NextFunction, Request, Response } from 'express';
import { processGitHubWebhook } from '../services/webhookService';
import { ValidationError } from '../utils/errors';

export async function handleGitHubWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.rawBody) {
      throw new ValidationError('Raw webhook request body is required for signature verification');
    }

    const result = await processGitHubWebhook({
      rawBody: req.rawBody,
      signature: req.header('x-hub-signature-256'),
      event: req.header('x-github-event'),
      deliveryId: req.header('x-github-delivery'),
      payload: req.body,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
