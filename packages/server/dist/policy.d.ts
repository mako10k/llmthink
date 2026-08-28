export declare const LLMTHINK_SERVER_HTTP_STACK: {
    readonly server: "node:http";
    readonly mcpTransport: "@modelcontextprotocol/sdk/server/streamableHttp.js#StreamableHTTPServerTransport";
};
export interface ServerBindPolicyInput {
    readonly hostname: string;
    readonly authenticationEnabled: boolean;
}
export declare function isExplicitLoopbackHostname(hostname: string): boolean;
export declare function assertServerBindPolicy(input: ServerBindPolicyInput): void;
