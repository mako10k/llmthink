export const OAUTH_PROTECTED_RESOURCE_PATH =
  "/.well-known/oauth-protected-resource";

export interface LlmthinkOAuthDiscoveryOptions {
  readonly resource: string;
  readonly authorizationServers: readonly string[];
  readonly scopesSupported: readonly string[];
  readonly resourceDocumentation?: string;
}

export interface LlmthinkOAuthDiscovery {
  readonly resource: string;
  readonly resourceMetadataUrl: string;
  readonly authorizationServers: readonly string[];
  readonly scopesSupported: readonly string[];
  readonly resourceDocumentation?: string;
}

function exactHttpsUrl(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute HTTPS URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${field} must be an absolute HTTPS URL without credentials, query, or fragment`,
    );
  }
  return url;
}

function uniqueNonEmpty<T>(values: readonly T[], field: string): readonly T[] {
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error(`${field} must be non-empty and contain no duplicates`);
  }
  return Object.freeze([...values]);
}

export function createLlmthinkOAuthDiscovery(
  options: LlmthinkOAuthDiscoveryOptions,
): LlmthinkOAuthDiscovery {
  const resource = exactHttpsUrl(options.resource, "OAuth resource");
  if (resource.href !== options.resource || resource.pathname.endsWith("/")) {
    throw new Error("OAuth resource must not have a trailing slash");
  }
  const authorizationServers = uniqueNonEmpty(
    options.authorizationServers,
    "OAuth authorization servers",
  );
  for (const issuer of authorizationServers) {
    exactHttpsUrl(issuer, "OAuth authorization server");
  }
  const scopesSupported = uniqueNonEmpty(
    options.scopesSupported,
    "OAuth supported scopes",
  );
  if (
    scopesSupported.some((scope) => !/^[A-Za-z0-9:_./-]{1,128}$/.test(scope))
  ) {
    throw new Error("OAuth supported scopes must be bounded safe values");
  }
  const resourceDocumentation = options.resourceDocumentation
    ? exactHttpsUrl(
        options.resourceDocumentation,
        "OAuth resource documentation",
      ).href
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

export function oauthProtectedResourceMetadata(
  discovery: LlmthinkOAuthDiscovery,
): Record<string, unknown> {
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

function quotedChallengeValue(value: string): string {
  if (/[^\u0020-\u007e]|["\\]/.test(value)) {
    throw new Error(
      "OAuth challenge values must be printable ASCII without quotes or backslashes",
    );
  }
  return `"${value}"`;
}

export function oauthBearerChallenge(
  discovery: LlmthinkOAuthDiscovery,
  error: "invalid_token" | "insufficient_scope" = "invalid_token",
  scopes: readonly string[] = discovery.scopesSupported,
): string {
  const fields = [
    `resource_metadata=${quotedChallengeValue(discovery.resourceMetadataUrl)}`,
    `error=${quotedChallengeValue(error)}`,
  ];
  if (scopes.length > 0) {
    fields.push(`scope=${quotedChallengeValue(scopes.join(" "))}`);
  }
  return `Bearer ${fields.join(", ")}`;
}
