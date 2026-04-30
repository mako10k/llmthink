export type EmbeddingProviderName = "none" | "ollama" | "openai";

export interface EmbeddingRequestOptions {
  provider?: EmbeddingProviderName;
}

interface EmbeddingResult {
  embeddings: number[][];
  provider: Exclude<EmbeddingProviderName, "none">;
  model: string;
}

interface EmbeddingProvider {
  embed(texts: string[]): Promise<EmbeddingResult>;
}

class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embed request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as { embeddings?: number[][] };
    if (!payload.embeddings || payload.embeddings.length !== texts.length) {
      throw new Error(
        "Ollama embed response did not contain the expected embeddings array",
      );
    }

    return {
      embeddings: payload.embeddings,
      provider: "ollama",
      model: this.model,
    };
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI embeddings request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embeddings = payload.data?.map((item) => item.embedding ?? []);
    if (
      !embeddings ||
      embeddings.length !== texts.length ||
      embeddings.some((embedding) => embedding.length === 0)
    ) {
      throw new Error(
        "OpenAI embeddings response did not contain the expected embeddings array",
      );
    }

    return {
      embeddings,
      provider: "openai",
      model: this.model,
    };
  }
}

function parseTimeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveProvider(
  options?: EmbeddingRequestOptions,
): EmbeddingProviderName {
  return (
    options?.provider ??
    (process.env.LLMTHINK_EMBEDDING_PROVIDER as
      | EmbeddingProviderName
      | undefined) ??
    "ollama"
  );
}

function createProvider(
  options?: EmbeddingRequestOptions,
): EmbeddingProvider | undefined {
  const provider = resolveProvider(options);
  if (provider === "none") {
    return undefined;
  }

  const timeoutMs = parseTimeout(
    process.env.LLMTHINK_EMBEDDING_TIMEOUT_MS,
    3000,
  );
  if (provider === "ollama") {
    return new OllamaEmbeddingProvider(
      trimTrailingSlash(
        process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      ),
      process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
      timeoutMs,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required when LLMTHINK_EMBEDDING_PROVIDER=openai",
    );
  }

  return new OpenAIEmbeddingProvider(
    trimTrailingSlash(
      process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    ),
    apiKey,
    process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
    timeoutMs,
  );
}

export async function embedTexts(
  texts: string[],
  options?: EmbeddingRequestOptions,
): Promise<EmbeddingResult | undefined> {
  if (texts.length === 0) {
    return undefined;
  }

  const provider = createProvider(options);
  if (!provider) {
    return undefined;
  }

  return provider.embed(texts);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! * left[index]!;
    rightNorm += right[index]! * right[index]!;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
