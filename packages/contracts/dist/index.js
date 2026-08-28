import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
export * from "./hosted-api.js";
export const MCP_TOOL_EFFECTS = [
    "read_only",
    "external_write",
    "consequential_external_write",
];
function fail(message) {
    throw new Error(`LLMThink contract validation failed: ${message}`);
}
function record(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(`${label} must be an object`);
    }
    return value;
}
function string(value, label) {
    if (typeof value !== "string" || value.length === 0) {
        fail(`${label} must be a non-empty string`);
    }
    return value;
}
function stringArray(value, label) {
    if (!Array.isArray(value))
        fail(`${label} must be an array`);
    const values = value.map((entry, index) => string(entry, `${label}[${index}]`));
    if (new Set(values).size !== values.length) {
        fail(`${label} must not contain duplicates`);
    }
    return values;
}
function sameMembers(left, right) {
    const sortedRight = [...right].sort();
    return (left.length === right.length &&
        [...left].sort().every((value, index) => value === sortedRight[index]));
}
function fullGitSha(value, label) {
    const revision = string(value, label);
    if (!/^[a-f0-9]{40}$/.test(revision)) {
        fail(`${label} must be a full Git SHA`);
    }
    return revision;
}
function surfaceTools(value, label) {
    if (!Array.isArray(value))
        fail(`${label} must be an array`);
    return value.map((entry, index) => {
        const tool = record(entry, `${label}[${index}]`);
        const effect = string(tool.effect, `${label}[${index}].effect`);
        if (!MCP_TOOL_EFFECTS.includes(effect)) {
            fail(`${label}[${index}].effect is unsupported: ${effect}`);
        }
        return {
            name: string(tool.name, `${label}[${index}].name`),
            effect: effect,
            required: stringArray(tool.required, `${label}[${index}].required`),
        };
    });
}
export function validateSurfaceContract(value) {
    const contract = record(value, "surface contract");
    if (contract.schema_version !== 1) {
        fail("surface contract schema_version must be 1");
    }
    const source = record(contract.source, "surface contract source");
    const surfaces = record(contract.surfaces, "surface contract surfaces");
    const onboarding = surfaceTools(surfaces.onboarding, "surfaces.onboarding");
    const admitted = surfaceTools(surfaces.admitted, "surfaces.admitted");
    const names = [...onboarding, ...admitted].map((tool) => tool.name);
    if (new Set(names).size !== names.length) {
        fail("tool names must be unique across surfaces");
    }
    const revision = fullGitSha(source.revision, "surface contract source.revision");
    return {
        schema_version: 1,
        contract_id: string(contract.contract_id, "surface contract contract_id"),
        contract_version: string(contract.contract_version, "surface contract contract_version"),
        source: {
            repository: string(source.repository, "surface contract source.repository"),
            revision,
        },
        surfaces: { onboarding, admitted },
    };
}
export function validateSchemaSet(value, surface) {
    const schemaSet = record(value, "schema set");
    if (schemaSet.schema_version !== 1)
        fail("schema set schema_version must be 1");
    if (schemaSet.contract_id !== surface.contract_id) {
        fail("schema set contract_id does not match surface contract");
    }
    if (schemaSet.contract_version !== surface.contract_version) {
        fail("schema set contract_version does not match surface contract");
    }
    const scopes = stringArray(schemaSet.scopes, "schema set scopes");
    const errorCodes = stringArray(schemaSet.error_codes, "schema set error_codes");
    const tools = record(schemaSet.tools, "schema set tools");
    const expectedTools = [
        ...surface.surfaces.onboarding.map((tool) => ({
            surface: "onboarding",
            tool,
        })),
        ...surface.surfaces.admitted.map((tool) => ({
            surface: "admitted",
            tool,
        })),
    ];
    const expectedNames = expectedTools.map(({ tool }) => tool.name);
    if (!sameMembers(Object.keys(tools), expectedNames)) {
        fail("schema set tool names do not match surface contract");
    }
    for (const expected of expectedTools) {
        validateToolSchema(expected.tool, expected.surface, tools[expected.tool.name], scopes, errorCodes);
    }
}
function assertKnownValues(values, allowed, label) {
    const unknown = values.find((value) => !allowed.includes(value));
    if (unknown)
        fail(`${label} ${unknown}`);
}
function validateToolSchema(expected, expectedSurface, value, scopes, errorCodes) {
    const tool = record(value, `schema set tool ${expected.name}`);
    if (tool.surface !== expectedSurface) {
        fail(`${expected.name} surface does not match surface contract`);
    }
    if (tool.effect !== expected.effect) {
        fail(`${expected.name} effect does not match surface contract`);
    }
    const requiredScopes = stringArray(tool.required_scopes, `${expected.name}.required_scopes`);
    assertKnownValues(requiredScopes, scopes, `${expected.name} uses unknown scope`);
    const input = record(tool.input_schema, `${expected.name}.input_schema`);
    if (input.type !== "object") {
        fail(`${expected.name}.input_schema must be object`);
    }
    const properties = record(input.properties, `${expected.name}.input_schema.properties`);
    const required = stringArray(input.required ?? [], `${expected.name}.input_schema.required`);
    if (!sameMembers(required, expected.required)) {
        fail(`${expected.name} required inputs do not match surface contract`);
    }
    assertKnownValues(required, Object.keys(properties), `${expected.name} requires undefined input property`);
    record(tool.output_schema, `${expected.name}.output_schema`);
    const toolErrors = stringArray(tool.error_codes, `${expected.name}.error_codes`);
    assertKnownValues(toolErrors, errorCodes, `${expected.name} uses unknown error`);
}
export function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
export function assertSurfaceConformance(expectedValue, candidateValue) {
    const expected = validateSurfaceContract(expectedValue);
    const candidate = validateSurfaceContract(candidateValue);
    if (candidate.contract_id !== expected.contract_id) {
        fail("candidate contract_id does not match");
    }
    if (candidate.contract_version !== expected.contract_version) {
        fail("candidate contract_version does not match");
    }
    for (const surfaceName of ["onboarding", "admitted"]) {
        const expectedTools = new Map(expected.surfaces[surfaceName].map((tool) => [tool.name, tool]));
        const candidateTools = new Map(candidate.surfaces[surfaceName].map((tool) => [tool.name, tool]));
        if (!sameMembers([...expectedTools.keys()], [...candidateTools.keys()])) {
            fail(`candidate ${surfaceName} tool names do not match`);
        }
        for (const [name, expectedTool] of expectedTools) {
            const candidateTool = candidateTools.get(name);
            if (candidateTool.effect !== expectedTool.effect) {
                fail(`candidate ${name} effect does not match`);
            }
            if (!sameMembers(candidateTool.required, expectedTool.required)) {
                fail(`candidate ${name} required inputs do not match`);
            }
        }
    }
}
export function assertExactContractBytes(expected, candidate) {
    if (sha256(expected) !== sha256(candidate)) {
        fail("candidate bytes do not match the canonical artifact");
    }
}
async function json(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
function safeArtifactPath(root, path) {
    const resolved = resolve(root, path);
    const location = relative(root, resolved);
    if (location === "" || location === ".." || location.startsWith(`..${sep}`)) {
        fail(`artifact path escapes contract root: ${path}`);
    }
    return resolved;
}
function contractArtifact(value, index) {
    const artifact = record(value, `manifest artifacts[${index}]`);
    const role = string(artifact.role, `manifest artifacts[${index}].role`);
    const path = string(artifact.path, `manifest artifacts[${index}].path`);
    const digest = string(artifact.sha256, `manifest artifacts[${index}].sha256`);
    if (role !== "surface" && role !== "schemas") {
        fail(`unsupported artifact role: ${role}`);
    }
    if (!/^[a-f0-9]{64}$/.test(digest)) {
        fail(`invalid artifact sha256: ${path}`);
    }
    return { role, path, sha256: digest };
}
function contractProvenance(value) {
    const provenance = record(value, "manifest provenance");
    return {
        tested_producer_revision: fullGitSha(provenance.tested_producer_revision, "manifest provenance tested_producer_revision"),
        retained_source_revision: fullGitSha(provenance.retained_source_revision, "manifest provenance retained_source_revision"),
        tested_consumer_repository: string(provenance.tested_consumer_repository, "manifest provenance tested_consumer_repository"),
        tested_consumer_revision: fullGitSha(provenance.tested_consumer_revision, "manifest provenance tested_consumer_revision"),
    };
}
function contractManifest(value, packageJson) {
    const manifest = record(value, "contract manifest");
    if (manifest.schema_version !== 1)
        fail("contract manifest schema_version must be 1");
    const packageName = string(manifest.package_name, "manifest package_name");
    const packageVersion = string(manifest.package_version, "manifest package_version");
    if (packageName !== packageJson.name)
        fail("manifest package_name mismatch");
    if (packageVersion !== packageJson.version)
        fail("manifest package_version mismatch");
    if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2) {
        fail("manifest must contain one surface and one schemas artifact");
    }
    return {
        schema_version: 1,
        package_name: packageName,
        package_version: packageVersion,
        contract_id: string(manifest.contract_id, "manifest contract_id"),
        contract_version: string(manifest.contract_version, "manifest contract_version"),
        artifacts: manifest.artifacts.map(contractArtifact),
        provenance: contractProvenance(manifest.provenance),
    };
}
export async function verifyContractPackage(packageRoot) {
    const packageJson = record(await json(resolve(packageRoot, "package.json")), "package.json");
    const contractRoot = resolve(packageRoot, "contracts");
    const manifest = contractManifest(await json(resolve(contractRoot, "manifest.json")), packageJson);
    const verified = [];
    const values = new Map();
    for (const artifact of manifest.artifacts) {
        if (values.has(artifact.role)) {
            fail(`duplicate artifact role: ${artifact.role}`);
        }
        const path = safeArtifactPath(contractRoot, artifact.path);
        const bytes = await readFile(path);
        const digest = sha256(bytes);
        if (digest !== artifact.sha256)
            fail(`stale artifact hash: ${artifact.path}`);
        values.set(artifact.role, JSON.parse(bytes.toString("utf8")));
        verified.push({
            role: artifact.role,
            path: artifact.path,
            sha256: digest,
        });
    }
    if (values.size !== 2 || !values.has("surface") || !values.has("schemas")) {
        fail("manifest must contain one surface and one schemas artifact");
    }
    const surface = validateSurfaceContract(values.get("surface"));
    if (surface.contract_id !== manifest.contract_id)
        fail("manifest contract_id mismatch");
    if (surface.contract_version !== manifest.contract_version) {
        fail("manifest contract_version mismatch");
    }
    validateSchemaSet(values.get("schemas"), surface);
    return {
        package_name: manifest.package_name,
        package_version: manifest.package_version,
        contract_id: manifest.contract_id,
        contract_version: manifest.contract_version,
        artifacts: verified,
        tool_count: surface.surfaces.onboarding.length + surface.surfaces.admitted.length,
    };
}
export async function verifyCandidateFiles(options) {
    const expectedBytes = await readFile(options.contractPath);
    const candidateBytes = await readFile(options.candidatePath);
    assertSurfaceConformance(JSON.parse(expectedBytes.toString("utf8")), JSON.parse(candidateBytes.toString("utf8")));
    if (options.exact)
        assertExactContractBytes(expectedBytes, candidateBytes);
}
//# sourceMappingURL=index.js.map