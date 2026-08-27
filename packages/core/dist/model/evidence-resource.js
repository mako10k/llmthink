const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;
const MIME_PATTERN = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
export class EvidenceResourceValidationError extends Error {
    span;
    endColumn;
    constructor(message, span, endColumn = span.column) {
        super(message);
        this.span = span;
        this.endColumn = endColumn;
    }
}
function fail(message, span, value = "") {
    throw new EvidenceResourceValidationError(message, span, span.column + value.length);
}
function normalizeSha256(value, span, kind) {
    const match = /^sha256:([0-9a-fA-F]{64})$/.exec(value);
    if (!match) {
        fail(`Evidence resource ${kind} must use sha256:<64 hex>`, span, value);
    }
    return (match[1] ?? "").toLowerCase();
}
function validateUrl(locator) {
    let parsed;
    try {
        parsed = new URL(locator.value);
    }
    catch {
        fail("Evidence resource URL must be an absolute http or https URL", locator.span, locator.value);
    }
    const scheme = parsed.protocol.replace(/:$/, "");
    if (scheme !== "http" && scheme !== "https") {
        fail(`Unsupported evidence resource URL scheme '${scheme}'`, locator.span, locator.value);
    }
}
function validateFile(locator) {
    if (!locator.value) {
        fail("Evidence resource file path must not be empty", locator.span);
    }
    if (locator.value.includes("\0")) {
        fail("Evidence resource file path must not contain NUL", locator.span, locator.value);
    }
}
function validateLocator(locator, resourceSpan) {
    if (!locator) {
        fail("Evidence resource locator is required", resourceSpan);
    }
    if (locator.kind === "url")
        validateUrl(locator);
    else if (locator.kind === "file")
        validateFile(locator);
    else if (locator.kind === "blob") {
        normalizeSha256(locator.value, locator.span, "blob");
    }
    else {
        fail(`Unknown evidence resource locator kind '${String(locator.kind)}'`, locator.span, locator.value);
    }
}
function validateDigest(digest) {
    if (!digest)
        return;
    if (digest.algorithm !== "sha256" || !SHA256_PATTERN.test(digest.value)) {
        fail("Evidence resource digest must use sha256:<64 hex>", digest.span, digest.value);
    }
}
function validateMime(mime) {
    if (mime && !MIME_PATTERN.test(mime.value)) {
        fail("Evidence resource MIME type must be type/subtype without parameters", mime.span, mime.value);
    }
}
function validateLabel(label) {
    if (label && !label.value.trim()) {
        fail("Evidence resource label must not be empty", label.span);
    }
}
export function validateEvidenceResource(resource) {
    const locator = resource.locator;
    validateLocator(locator, resource.span);
    validateDigest(resource.digest);
    validateMime(resource.mime);
    validateLabel(resource.label);
    if (locator?.kind === "blob" && resource.digest) {
        fail("Evidence resource blob locator cannot be combined with digest metadata", resource.digest.span, resource.digest.value);
    }
}
export function createEvidenceResource(input) {
    if (input.locator.kind === "blob" && input.digest) {
        fail("Evidence resource blob locator cannot be combined with digest metadata", input.digest.span, input.digest.value);
    }
    const locator = input.locator.kind === "blob"
        ? {
            ...input.locator,
            value: `sha256:${normalizeSha256(input.locator.value, input.locator.span, "blob")}`,
        }
        : input.locator;
    const digest = input.digest
        ? {
            algorithm: "sha256",
            value: normalizeSha256(input.digest.value, input.digest.span, "digest"),
            span: input.digest.span,
        }
        : undefined;
    const resource = {
        locator,
        ...(digest ? { digest } : {}),
        ...(input.mime ? { mime: input.mime } : {}),
        ...(input.label ? { label: input.label } : {}),
        span: input.span,
    };
    validateEvidenceResource(resource);
    return resource;
}
//# sourceMappingURL=evidence-resource.js.map