export const LLMTHINK_CANONICAL_FILE_EXTENSION = ".think";
export const LLMTHINK_LEGACY_FILE_EXTENSIONS = [".dsl"];
export const LLMTHINK_FILE_EXTENSIONS = [
    LLMTHINK_CANONICAL_FILE_EXTENSION,
    ...LLMTHINK_LEGACY_FILE_EXTENSIONS,
];
export function llmthinkFileExtension(value) {
    const lowerValue = value.toLowerCase();
    return LLMTHINK_FILE_EXTENSIONS.find((extension) => lowerValue.endsWith(extension));
}
export function isLlmthinkFilePath(value) {
    return llmthinkFileExtension(value) !== undefined;
}
export function stripLlmthinkFileExtension(value) {
    const extension = llmthinkFileExtension(value);
    return extension ? value.slice(0, -extension.length) : value;
}
export function alternateLlmthinkFilePath(value) {
    const extension = llmthinkFileExtension(value);
    if (!extension) {
        return undefined;
    }
    const alternateExtension = extension === LLMTHINK_CANONICAL_FILE_EXTENSION
        ? LLMTHINK_LEGACY_FILE_EXTENSIONS[0]
        : LLMTHINK_CANONICAL_FILE_EXTENSION;
    return `${value.slice(0, -extension.length)}${alternateExtension}`;
}
//# sourceMappingURL=file-extension.js.map