import { describe, expect, it } from 'vitest';
import { buildCursorMcpConfig, buildMcpEndpointUrl, PLACEHOLDER_TOKEN } from './mcpCursorConfig';

describe('buildCursorMcpConfig', () => {
  it('produces valid JSON with url and token in headers', () => {
    const json = buildCursorMcpConfig('https://keel.local/api/mcp', 'my-secret-token');
    const parsed = JSON.parse(json);
    expect(parsed.mcpServers['keel-http']).toEqual({
      url: 'https://keel.local/api/mcp',
      headers: { Authorization: 'Bearer my-secret-token' },
    });
  });

  it('outputs pretty-printed JSON', () => {
    const json = buildCursorMcpConfig('https://example.com/api/mcp', 'token');
    expect(json).toContain('\n');
    expect(json).toMatch(/^\{\s*\n/);
  });

  it('uses placeholder token constant when passed', () => {
    const json = buildCursorMcpConfig('https://keel.local/api/mcp', PLACEHOLDER_TOKEN);
    expect(json).toContain(PLACEHOLDER_TOKEN);
    expect(json).toContain(`Bearer ${PLACEHOLDER_TOKEN}`);
  });

  it('handles empty token', () => {
    const json = buildCursorMcpConfig('https://keel.local/api/mcp', '');
    expect(json).toContain('Bearer ');
  });
});

describe('buildMcpEndpointUrl', () => {
  it('uses the backend origin instead of the frontend origin', () => {
    expect(buildMcpEndpointUrl('http://localhost:48888')).toBe('http://localhost:48888/api/mcp');
  });

  it('normalizes trailing slashes', () => {
    expect(buildMcpEndpointUrl('http://localhost:48888/')).toBe('http://localhost:48888/api/mcp');
  });
});
