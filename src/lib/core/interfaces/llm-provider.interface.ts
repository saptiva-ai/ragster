export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

export interface GenerateResult {
  content: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface LLMProvider {
  /**
   * Generate text completion
   */
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;

  /**
   * Generate with streaming (optional)
   */
  generateStream?(prompt: string, options?: GenerateOptions): AsyncGenerator<string>;

  /**
   * Provider name
   */
  getName(): string;

  /**
   * Model name
   */
  getModel(): string;
}
