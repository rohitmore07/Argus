import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { User } from '../models';
import { llmRegistry } from '../integrations/llm/llmProvider';
import '../integrations/llm/geminiProvider';

export async function getSettings(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  res.json({
    account: {
      name: user.name,
      email: user.email,
      githubUsername: user.githubUsername,
      githubConnected: user.githubConnected,
      avatarUrl: user.avatarUrl,
      role: user.role,
    },
    defaultReviewSettings: user.defaultReviewSettings,
    aiPreferences: user.aiPreferences,
    notificationPreferences: user.notificationPreferences,
    infrastructure: {
      providers: llmRegistry.list(),
      availableGeminiModels: [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
      ],
      webhookEndpointUrl:
        env.GITHUB_WEBHOOK_PUBLIC_URL || `${env.BACKEND_URL.replace(/\/$/, '')}/api/webhooks/github`,
      githubOAuthConfigured: env.isGitHubOAuthConfigured,
      githubAppConfigured: env.isGitHubAppConfigured,
      geminiConfigured: env.isGeminiConfigured,
    },
  });
}

export async function updateSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    if (req.body.defaultReviewSettings) {
      const nextSettings = {
        ...user.defaultReviewSettings,
        ...req.body.defaultReviewSettings,
      };
      const categories = new Set(nextSettings.enabledCategories);
      if (nextSettings.enableBugDetection) categories.add('bug');
      else categories.delete('bug');
      if (nextSettings.enableSecurityAnalysis) categories.add('security');
      else categories.delete('security');
      if (nextSettings.enablePerformanceAnalysis) categories.add('performance');
      else categories.delete('performance');
      if (nextSettings.enableCodeQualityAnalysis) categories.add('code_quality');
      else categories.delete('code_quality');
      nextSettings.enabledCategories = Array.from(categories);
      user.defaultReviewSettings = nextSettings;
    }

    if (req.body.aiPreferences) {
      user.aiPreferences = {
        ...user.aiPreferences,
        ...req.body.aiPreferences,
      };
    }

    if (req.body.notificationPreferences) {
      user.notificationPreferences = {
        ...user.notificationPreferences,
        ...req.body.notificationPreferences,
      };
    }

    await user.save();

    res.json({
      defaultReviewSettings: user.defaultReviewSettings,
      aiPreferences: user.aiPreferences,
      notificationPreferences: user.notificationPreferences,
    });
  } catch (err) {
    next(err);
  }
}
