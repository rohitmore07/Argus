import { GoogleGenAI, type Schema } from '@google/genai';
import { env } from '../../config/env';
import { ExternalServiceError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
  LLMProvider,
  LLMStructuredRequest,
  LLMStructuredResponse,
  llmRegistry,
} from './llmProvider';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini';
  public readonly defaultModel = env.GEMINI_MODEL || 'gemini-2.5-flash';
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!env.GEMINI_API_KEY) {
      throw new ExternalServiceError(
        'Gemini API',
        'GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in backend/.env to run AI code reviews.',
        503
      );
    }
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(env.GEMINI_API_KEY);
  }

  async generateStructured<T>(request: LLMStructuredRequest): Promise<LLMStructuredResponse<T>> {
    const client = this.getClient();
    const model = request.model || this.defaultModel;
    const maxRetries = 3;

    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: request.userPrompt,
          config: {
            systemInstruction: request.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: request.responseSchema as unknown as Schema,
            temperature: request.temperature ?? 0.1,
            maxOutputTokens: request.maxOutputTokens ?? 8192,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('Gemini returned an empty response payload');
        }

        const parsed = JSON.parse(text) as T;
        const tokensUsed =
          (response.usageMetadata?.totalTokenCount as number | undefined) || 0;

        return {
          data: parsed,
          model,
          provider: this.name,
          tokensUsed,
        };
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /429|503|500|quota|rate|timeout|unavailable/i.test(msg);
        logger.warn('Gemini structured generation attempt failed', {
          attempt: attempt + 1,
          model,
          transient: isTransient,
          error: msg,
        });

        if (isTransient && attempt < maxRetries - 1) {
          await sleep(1500 * Math.pow(2, attempt));
          continue;
        }
        break;
      }
    }

    throw new ExternalServiceError(
      'Gemini API',
      lastError instanceof Error ? lastError.message : 'Failed to generate structured AI review',
      502
    );
  }
}

export const geminiProvider = new GeminiProvider();
llmRegistry.register(geminiProvider);
