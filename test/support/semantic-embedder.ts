export async function deterministicSemanticEmbedder(texts: string[]) {
  return {
    embeddings: texts.map((text) => {
      if (text.includes("速度")) return [0, 1];
      if (text.includes("コスト") || text.includes("安価")) return [1, 0];
      return [0.1, 0.1];
    }),
    provider: "deterministic",
    model: "test-2d",
  };
}
