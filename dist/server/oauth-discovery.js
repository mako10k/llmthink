export const OAUTH_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
function exactHttpsUrl(value, field) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error(`${field} must be an absolute HTTPS URL`);
    }
    if (url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash) {
        throw new Error(`${field} must be an absolute HTTPS URL without credentials, query, or fragment`);
    }
    return url;
}
function uniqueNonEmpty(values, field) {
    if (values.length === 0 || new Set(values).size !== values.length) {
        throw new Error(`${field} must be non-empty and contain no duplicates`);
    }
    return Object.freeze([...values]);
}
export function createLlmthinkOAuthDiscovery(options) {
    const resource = exactHttpsUrl(options.resource, "OAuth resource");
    if (resource.href !== options.resource || resource.pathname.endsWith("/")) {
        throw new Error("OAuth resource must not have a trailing slash");
    }
    const authorizationServers = uniqueNonEmpty(options.authorizationServers, "OAuth authorization servers");
    for (const issuer of authorizationServers) {
        exactHttpsUrl(issuer, "OAuth authorization server");
    }
    const scopesSupported = uniqueNonEmpty(options.scopesSupported, "OAuth supported scopes");
    const resourceDocumentation = options.resourceDocumentation
        ? exactHttpsUrl(options.resourceDocumentation, "OAuth resource documentation").href
        : undefined;
    return Object.freeze({
        resource: resource.href,
        resourceMetadataUrl: new URL(OAUTH_PROTECTED_RESOURCE_PATH, resource.origin)
            .href,
        authorizationServers,
        scopesSupported,
        ...(resourceDocumentation ? { resourceDocumentation } : {}),
    });
}
export function oauthProtectedResourceMetadata(discovery) {
    return {
        resource: discovery.resource,
        authorization_servers: discovery.authorizationServers,
        scopes_supported: discovery.scopesSupported,
        bearer_methods_supported: ["header"],
        ...(discovery.resourceDocumentation
            ? { resource_documentation: discovery.resourceDocumentation }
            : {}),
    };
}
function quotedChallengeValue(value) {
    if (/[^\u0020-\u007e]|["\\]/.test(value)) {
        throw new Error("OAuth challenge values must be printable ASCII without quotes or backslashes");
    }
    return `"${value}"`;
}
export function oauthBearerChallenge(discovery, error = "invalid_token", scopes = discovery.scopesSupported) {
    const fields = [
        `resource_metadata=${quotedChallengeValue(discovery.resourceMetadataUrl)}`,
        `error=${quotedChallengeValue(error)}`,
    ];
    if (scopes.length > 0) {
        fields.push(`scope=${quotedChallengeValue(scopes.join(" "))}`);
    }
    return `Bearer ${fields.join(", ")}`;
}
//# sourceMappingURL=oauth-discovery.js.map