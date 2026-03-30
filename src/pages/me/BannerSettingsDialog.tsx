import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { apiFetch, apiJson } from '../../auth/api';

type InstanceBannerDto = {
  backgroundColor: string;
  message: string;
};

type BannerSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function BannerSettingsDialog({ open, onClose }: BannerSettingsDialogProps) {
  const [backgroundColor, setBackgroundColor] = useState('#1e40af');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSavedOk(false);
      try {
        const res = await apiJson<InstanceBannerDto>('/api/instance-banner');
        if (!cancelled) {
          setBackgroundColor(res.backgroundColor?.trim() || '#1e40af');
          setMessage(res.message ?? '');
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('Failed to load banner settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await apiFetch('/api/admin/instance-banner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundColor, message }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const next = (await res.json()) as InstanceBannerDto;
      setBackgroundColor(next.backgroundColor?.trim() || '#1e40af');
      setMessage(next.message ?? '');
      setSavedOk(true);
      window.dispatchEvent(new CustomEvent('keel-instance-banner-updated'));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        aria-labelledby="banner-settings-title"
        aria-modal="true"
      >
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h3 id="banner-settings-title" className="text-lg font-semibold text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-violet-400 shrink-0" />
            Instance banner
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            type="button"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <p className="text-sm text-zinc-400 mb-4">
            Shown at the top of the app for all signed-in users when the message is non-empty.
          </p>

          {loading && <div className="text-sm text-zinc-400">Loading...</div>}
          {!loading && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-zinc-400 mb-1">Background color</div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    value={normalizeColorForInput(backgroundColor)}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-zinc-700 bg-zinc-950 p-0.5"
                    aria-label="Background color"
                  />
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1 min-w-[10rem] rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-200"
                    placeholder="#1e40af or rgb(30, 64, 175)"
                    spellCheck={false}
                  />
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-400 mb-1">Message</div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
                  placeholder="Leave empty to hide the banner."
                />
              </div>
              {error && <div className="text-sm text-red-300">{error}</div>}
              {savedOk && !error && <div className="text-sm text-emerald-400">Saved.</div>}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeColorForInput(css: string): string {
  const t = css.trim();
  const hex = parseHex6(t);
  if (hex) return hex;
  const rgb = t.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }
  return '#1e40af';
}

function to2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

function parseHex6(s: string): string | null {
  const long = s.match(/^#([0-9a-fA-F]{6})$/);
  if (long) return `#${long[1].toLowerCase()}`;
  const short = s.match(/^#([0-9a-fA-F]{3})$/);
  if (short) {
    const [a, b, c] = short[1].split('');
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return null;
}
