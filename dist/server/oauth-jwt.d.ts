import { type JWTVerifyGetKey } from "jose";
import type { LlmthinkBearerTokenVerifier, VerifiedBearerIdentity } from "./security.js";
export interface LlmthinkExternalOAuthIdentity {
    readonly issuer: string;
    readonly subjectId: string;
    readonly organizationId?: string;
    readonly tokenId?: string;
    readonly authorizedParty?: string;
    readonly tokenScopes: readonly string[];
}
export type LlmthinkOAuthAccountResolver = (identity: LlmthinkExternalOAuthIdentity) => Promise<VerifiedBearerIdentity>;
export interface LlmthinkJwtVerifierOptions {
    readonly issuer: string;
    readonly audience: string;
    readonly jwks: JWTVerifyGetKey;
    readonly resolveAccount: LlmthinkOAuthAccountResolver;
    readonly algorithms?: readonly string[];
    readonly allowedAuthorizedParties?: readonly string[];
    readonly allowedTokenScopes?: readonly string[];
    readonly requiredTokenScopes?: readonly string[];
    readonly clockToleranceSeconds?: number;
}
export interface LlmthinkRemoteJwksOptions {
    readonly jwksUri: string;
    readonly timeoutMilliseconds?: number;
    readonly cooldownMilliseconds?: number;
    readonly cacheMaxAgeMilliseconds?: number;
}
export declare function createLlmthinkRemoteJwks(options: LlmthinkRemoteJwksOptions): JWTVerifyGetKey;
export declare function createLlmthinkJwtTokenVerifier(options: LlmthinkJwtVerifierOptions): LlmthinkBearerTokenVerifier;
