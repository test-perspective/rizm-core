/**
 * Builds a Cursor MCP config JSON string for copy-paste into ~/.cursor/mcp.json.
 * Uses direct token paste (no env var reference) for local personal use.
 */
export function buildMcpEndpointUrl(baseUrl: string): string {
  return new URL('/api/mcp', `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

export function buildCursorMcpConfig(url: string, token: string): string {
  const config = {
    mcpServers: {
      'keel-http': {
        url,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}

export const PLACEHOLDER_TOKEN = 'PASTE_YOUR_MCP_API_KEY_HERE';
