export interface LLMStructuredRequest {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LLMStructuredResponse<T> {
  data: T;
  model: string;
  provider: string;
  tokensUsed: number;
}

/**
 * Provider-agnostic LLM abstraction enabling seamless support for additional providers
 * (e.g., OpenAI, Anthropic, Vertex AI) while keeping Gemini as the primary provider.
 */
export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  isConfigured(): boolean;
  generateStructured<T>(request: LLMStructuredRequest): Promise<LLMStructuredResponse<T>>;
}

class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`LLM provider "${name}" is not registered`);
    }
    return provider;
  }

  list(): Array<{ name: string; defaultModel: string; configured: boolean }> {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      defaultModel: p.defaultModel,
      configured: p.isConfigured(),
    }));
  }
}

export const llmRegistry = new LLMProviderRegistry();
