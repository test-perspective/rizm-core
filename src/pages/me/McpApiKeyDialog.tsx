import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiBaseUrl, apiFetch, apiJson } from '../../auth/api';
import { buildCursorMcpConfig, buildMcpEndpointUrl, PLACEHOLDER_TOKEN } from './mcpCursorConfig';

type McpApiKeyStatus = {
  hasKey: boolean;
  lastUsedAt: number | null;
  updatedAt: number | null;
  revokedAt: number | null;
};

type McpApiKeyDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function McpApiKeyDialog({ open, onClose }: McpApiKeyDialogProps) {
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [status, setStatus] = useState<McpApiKeyStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await apiJson<McpApiKeyStatus>('/api/me/mcp-api-key');
      setStatus(res);
    } catch (e) {
      console.error(e);
      setMessage('Failed to load MCP API key status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open]);

  const issueKey = async () => {
    setIssuing(true);
    setMessage(null);
    setNewToken(null);
    try {
      const res = await apiJson<{ token: string }>('/api/me/mcp-api-key', {
        method: 'POST',
      });
      setNewToken(res.token);
      setMessage('A new MCP API key has been generated. Save it now; it will not be shown again.');
      await reload();
    } catch (e) {
      console.error(e);
      setMessage('Failed to generate MCP API key.');
    } finally {
      setIssuing(false);
    }
  };

  const revokeKey = async () => {
    setRevoking(true);
    setMessage(null);
    setNewToken(null);
    try {
      const res = await apiFetch('/api/me/mcp-api-key', { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      setMessage('MCP API key has been revoked.');
      await reload();
    } catch (e) {
      console.error(e);
      setMessage('Failed to revoke MCP API key.');
    } finally {
      setRevoking(false);
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setMessage('Copied MCP API key to clipboard.');
    } catch (e) {
      console.error(e);
      setMessage('Failed to copy key. Please copy manually.');
    }
  };

  const mcpUrl = buildMcpEndpointUrl(apiBaseUrl());
  const copyConfig = async (configJson: string) => {
    try {
      await navigator.clipboard.writeText(configJson);
      setMessage('Copied Cursor config to clipboard.');
    } catch (e) {
      console.error(e);
      setMessage('Failed to copy config. Please copy manually.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold text-white">MCP API Key</h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-zinc-400 mb-4">
            Use this key for Cursor MCP HTTP connection. Set <span className="font-mono">Authorization: Bearer ...</span>.
          </p>
          {message && (
            <div className="mb-4 text-sm text-zinc-200 bg-zinc-950/40 border border-zinc-800 rounded-md p-3">
              {message}
            </div>
          )}
          <div className="text-sm text-zinc-300 space-y-1 mb-4">
            <div>Status: {loading ? 'Loading...' : status?.hasKey ? 'Issued' : 'Not issued'}</div>
            <div>Last used: {status?.lastUsedAt ? new Date(status.lastUsedAt).toLocaleString() : '—'}</div>
            <div>Updated: {status?.updatedAt ? new Date(status.updatedAt).toLocaleString() : '—'}</div>
          </div>
          {newToken && (
            <div className="mb-4 border border-zinc-800 rounded-md p-3 bg-zinc-950/40">
              <div className="text-xs text-zinc-400">New key (shown only once)</div>
              <div className="mt-2 font-mono text-xs break-all text-emerald-300">{newToken}</div>
              <button
                onClick={copyToken}
                className="mt-3 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-xs"
              >
                Copy
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 mb-6">
            <button
              disabled={issuing}
              onClick={issueKey}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 rounded-md text-sm font-medium transition-colors"
            >
              {issuing ? 'Generating...' : status?.hasKey ? 'Regenerate Key' : 'Generate Key'}
            </button>
            <button
              disabled={!status?.hasKey || revoking}
              onClick={revokeKey}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
            >
              {revoking ? 'Revoking...' : 'Revoke'}
            </button>
          </div>
          <div className="border-t border-zinc-800 pt-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-2">Cursor MCP config (copy & paste into ~/.cursor/mcp.json)</h3>
            <div className="text-xs text-zinc-400 mb-1">Replace with your MCP API key.</div>
            <pre className="font-mono text-xs bg-zinc-950/60 border border-zinc-800 rounded-md p-3 overflow-x-auto text-zinc-400">
              {buildCursorMcpConfig(mcpUrl, PLACEHOLDER_TOKEN)}
            </pre>
            <button
              onClick={() => copyConfig(buildCursorMcpConfig(mcpUrl, PLACEHOLDER_TOKEN))}
              className="mt-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-xs"
            >
              Copy config
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
