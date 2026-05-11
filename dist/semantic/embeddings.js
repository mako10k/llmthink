import { resolveEmbeddingConfig } from "../config/runtime.js";
class OllamaEmbeddingProvider {
    baseUrl;
    model;
    timeoutMs;
    constructor(baseUrl, model, timeoutMs) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.timeoutMs = timeoutMs;
    }
    async embed(texts) {
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
            throw new Error(`Ollama embed request failed with status ${response.status}`);
        }
        const payload = (await response.json());
        if (!payload.embeddings || payload.embeddings.length !== texts.length) {
            throw new Error("Ollama embed response did not contain the expected embeddings array");
        }
        return {
            embeddings: payload.embeddings,
            provider: "ollama",
            model: this.model,
        };
    }
}
class OpenAIEmbeddingProvider {
    baseUrl;
    apiKey;
    model;
    timeoutMs;
    constructor(baseUrl, apiKey, model, timeoutMs) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.model = model;
        this.timeoutMs = timeoutMs;
    }
    async embed(texts) {
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
            throw new Error(`OpenAI embeddings request failed with status ${response.status}`);
        }
        const payload = (await response.json());
        const embeddings = payload.data?.map((item) => item.embedding ?? []);
        if (!embeddings ||
            embeddings.length !== texts.length ||
            embeddings.some((embedding) => embedding.length === 0)) {
            throw new Error("OpenAI embeddings response did not contain the expected embeddings array");
        }
        return {
            embeddings,
            provider: "openai",
            model: this.model,
        };
    }
}
function parseTimeout(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function trimTrailingSlash(value) {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}
function resolveProvider(options) {
    return (options?.provider ??
        process.env.LLMTHINK_EMBEDDING_PROVIDER ??
        "ollama");
}
function createProvider(options) {
    const provider = resolveProvider(options);
    if (provider === "none") {
        return undefined;
    }
    const config = resolveEmbeddingConfig({ cwd: process.cwd() });
    const timeoutMs = parseTimeout(String(config.timeoutMs), 3000);
    if (provider === "ollama") {
        return new OllamaEmbeddingProvider(trimTrailingSlash(config.ollamaBaseUrl), config.ollamaModel, timeoutMs);
    }
    const apiKey = config.openaiApiKey;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required when LLMTHINK_EMBEDDING_PROVIDER=openai");
    }
    return new OpenAIEmbeddingProvider(trimTrailingSlash(config.openaiBaseUrl), apiKey, config.openaiModel, timeoutMs);
}
export async function embedTexts(texts, options) {
    if (texts.length === 0) {
        return undefined;
    }
    const provider = createProvider(options);
    if (!provider) {
        return undefined;
    }
    return provider.embed(texts);
}
export function cosineSimilarity(left, right) {
    if (left.length === 0 || right.length === 0 || left.length !== right.length) {
        return 0;
    }
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftNorm += left[index] * left[index];
        rightNorm += right[index] * right[index];
    }
    if (leftNorm === 0 || rightNorm === 0) {
        return 0;
    }
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
//# sourceMappingURL=embeddings.js.map