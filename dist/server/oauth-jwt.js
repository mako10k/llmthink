import { createRemoteJWKSet, jwtVerify, } from "jose";
function parseExactHttpsUrl(value, field) {
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
function boundedUniqueStrings(values, field) {
    if (!values)
        return undefined;
    if (values.length === 0 ||
        values.length > 64 ||
        values.some((value) => !/^[A-Za-z0-9:_./-]{1,128}$/.test(value)) ||
        new Set(values).size !== values.length) {
        throw new Error(`${field} must contain 1..64 unique bounded values`);
    }
    return new Set(values);
}
function tokenScopes(payload) {
    if (payload.scope === undefined)
        return [];
    if (typeof payload.scope !== "string") {
        throw new Error("OAuth scope claim must be a string");
    }
    const scopes = payload.scope.split(" ").filter(Boolean);
    if (scopes.length > 64 ||
        scopes.some((scope) => !/^[A-Za-z0-9:_./-]{1,128}$/.test(scope)) ||
        new Set(scopes).size !== scopes.length) {
        throw new Error("OAuth scope claim is invalid or unbounded");
    }
    return Object.freeze(scopes);
}
function optionalBoundedClaim(payload, name) {
    const value = payload[name];
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(value)) {
        throw new Error(`OAuth ${name} claim is invalid`);
    }
    return value;
}
export function createLlmthinkRemoteJwks(options) {
    const url = parseExactHttpsUrl(options.jwksUri, "OAuth JWKS URI");
    return createRemoteJWKSet(url, {
        timeoutDuration: options.timeoutMilliseconds ?? 5_000,
        cooldownDuration: options.cooldownMilliseconds ?? 30_000,
        cacheMaxAge: options.cacheMaxAgeMilliseconds ?? 10 * 60_000,
    });
}
export function createLlmthinkJwtIdentityVerifier(options) {
    parseExactHttpsUrl(options.issuer, "OAuth issuer");
    parseExactHttpsUrl(options.audience, "OAuth audience");
    const algorithms = options.algorithms ?? ["RS256"];
    const allowedAuthorizedParties = boundedUniqueStrings(options.allowedAuthorizedParties, "OAuth authorized parties");
    const allowedScopes = boundedUniqueStrings(options.allowedTokenScopes, "OAuth allowed token scopes");
    const requiredScopes = boundedUniqueStrings(options.requiredTokenScopes, "OAuth required token scopes");
    if (algorithms.length === 0 ||
        algorithms.length > 8 ||
        algorithms.some((algorithm) => !/^(?:RS|PS|ES)\d{3}$/.test(algorithm))) {
        throw new Error("OAuth JWT algorithms must be a bounded asymmetric allowlist");
    }
    if (requiredScopes &&
        allowedScopes &&
        [...requiredScopes].some((scope) => !allowedScopes.has(scope))) {
        throw new Error("OAuth required token scopes must be allowed");
    }
    const acceptedIdentity = (payload) => {
        const subjectId = payload.sub;
        if (!subjectId)
            throw new Error("OAuth subject claim is required");
        const scopes = tokenScopes(payload);
        if (allowedScopes && scopes.some((scope) => !allowedScopes.has(scope))) {
            throw new Error("OAuth token contains an unsupported scope");
        }
        if (requiredScopes &&
            [...requiredScopes].some((scope) => !scopes.includes(scope))) {
            throw new Error("OAuth token is missing a required scope");
        }
        const authorizedParty = optionalBoundedClaim(payload, "azp");
        if (allowedAuthorizedParties &&
            (!authorizedParty || !allowedAuthorizedParties.has(authorizedParty))) {
            throw new Error("OAuth authorized party is not allowed");
        }
        const organizationId = optionalBoundedClaim(payload, "org_id");
        const tokenId = optionalBoundedClaim(payload, "jti");
        return {
            issuer: options.issuer,
            subjectId,
            tokenScopes: scopes,
            ...(organizationId ? { organizationId } : {}),
            ...(tokenId ? { tokenId } : {}),
            ...(authorizedParty ? { authorizedParty } : {}),
        };
    };
    return async (token) => {
        const { payload } = await jwtVerify(token, options.jwks, {
            issuer: options.issuer,
            audience: options.audience,
            algorithms: [...algorithms],
            requiredClaims: ["sub", "iat", "exp"],
            clockTolerance: options.clockToleranceSeconds ?? 5,
        });
        return acceptedIdentity(payload);
    };
}
export function createLlmthinkJwtTokenVerifier(options) {
    const verifyIdentity = createLlmthinkJwtIdentityVerifier(options);
    return async (token) => options.resolveAccount(await verifyIdentity(token));
}
//# sourceMappingURL=oauth-jwt.js.map