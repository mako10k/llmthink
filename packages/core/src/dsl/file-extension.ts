export const LLMTHINK_CANONICAL_FILE_EXTENSION = ".think" as const;

export const LLMTHINK_LEGACY_FILE_EXTENSIONS = [".dsl"] as const;

export const LLMTHINK_FILE_EXTENSIONS = [
  LLMTHINK_CANONICAL_FILE_EXTENSION,
  ...LLMTHINK_LEGACY_FILE_EXTENSIONS,
] as const;

export type LlmthinkFileExtension = (typeof LLMTHINK_FILE_EXTENSIONS)[number];

export function llmthinkFileExtension(
  value: string,
): LlmthinkFileExtension | undefined {
  const lowerValue = value.toLowerCase();
  return LLMTHINK_FILE_EXTENSIONS.find((extension) =>
    lowerValue.endsWith(extension),
  );
}

export function isLlmthinkFilePath(value: string): boolean {
  return llmthinkFileExtension(value) !== undefined;
}

export function stripLlmthinkFileExtension(value: string): string {
  const extension = llmthinkFileExtension(value);
  return extension ? value.slice(0, -extension.length) : value;
}

export function alternateLlmthinkFilePath(value: string): string | undefined {
  const extension = llmthinkFileExtension(value);
  if (!extension) {
    return undefined;
  }
  const alternateExtension =
    extension === LLMTHINK_CANONICAL_FILE_EXTENSION
      ? LLMTHINK_LEGACY_FILE_EXTENSIONS[0]
      : LLMTHINK_CANONICAL_FILE_EXTENSION;
  return `${value.slice(0, -extension.length)}${alternateExtension}`;
}
