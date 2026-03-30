import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';
import type { AiProvider, LlmConfig } from '../../utils/aiTransform';
import { getStoredModelForProvider } from '../../utils/aiTransform';
import { fetchOpenRouterModels } from '../../api/openrouter';
import type { OpenRouterModel } from '../../api/openrouter';

type LlmSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  config: LlmConfig;
  onSave: (config: LlmConfig) => void;
};

const OLLAMA_TOOL_CALLING_MODELS = [
  'llama3.2',
  'llama3.1',
  'deepseek-r1',
  'qwen2.5',
  'qwen3',
  'mistral',
  'codellama',
];

export function LlmSettingsDialog({ open, onClose, config, onSave }: LlmSettingsDialogProps) {
  const mousedownTargetRef = useRef<EventTarget | null>(null);
  const [provider, setProvider] = useState<AiProvider>(config.provider);
  const [model, setModel] = useState(config.model || '');
  const [deepseekApiKey, setDeepseekApiKey] = useState(config.deepseekApiKey || '');
  const [openrouterApiKey, setOpenrouterApiKey] = useState(config.openrouterApiKey || '');
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (open) {
      setProvider(config.provider);
      setModel(config.model || '');
      setDeepseekApiKey(config.deepseekApiKey || '');
      setOpenrouterApiKey(config.openrouterApiKey || '');
    }
  }, [open, config]);

  useEffect(() => {
    if (open && provider === 'openrouter') {
      setLoadingModels(true);
      fetchOpenRouterModels()
        .then(setOpenrouterModels)
        .catch(() => setOpenrouterModels([]))
        .finally(() => setLoadingModels(false));
    }
  }, [open, provider]);

  const handleSave = () => {
    onSave({
      provider,
      model: model.trim() || undefined,
      deepseekApiKey: deepseekApiKey.trim() || undefined,
      openrouterApiKey: openrouterApiKey.trim() || undefined,
    });
    onClose();
  };

  if (!open) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      mousedownTargetRef.current = e.target;
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mousedownTargetRef.current === e.currentTarget) {
      onClose();
    }
    mousedownTargetRef.current = null;
  };

  const handleProviderChange = (nextProvider: AiProvider) => {
    setProvider(nextProvider);
    const storedModel = getStoredModelForProvider(nextProvider);
    setModel(
      nextProvider === 'ollama'
        ? storedModel || OLLAMA_TOOL_CALLING_MODELS[0]
        : storedModel || ''
    );
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="bg-zinc-900 rounded-lg w-full max-w-md border border-zinc-700 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-bold text-white">LLM Settings</h2>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange((e.target.value as AiProvider) || 'deepseek')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="openrouter">Open Router</option>
              <option value="deepseek">DeepSeek API</option>
              <option value="ollama">Local (Ollama)</option>
            </select>
          </div>

          {provider === 'openrouter' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Model</label>
                <Autocomplete
                  value={openrouterModels.find((m) => m.id === model) ?? null}
                  onChange={(_, v) => setModel(v?.id ?? '')}
                  options={openrouterModels}
                  getOptionLabel={(m) => m.name || m.id}
                  filterOptions={(opts, { inputValue }) => {
                    const q = inputValue.trim().toLowerCase();
                    if (!q) return opts;
                    return opts.filter(
                      (m) =>
                        (m.id ?? '').toLowerCase().includes(q) ||
                        (m.name ?? '').toLowerCase().includes(q)
                    );
                  }}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  loading={loadingModels}
                  disabled={loadingModels}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      variant="outlined"
                      size="small"
                      placeholder="Search or select model..."
                      inputProps={{
                        ...params.inputProps,
                        autoComplete: 'one-time-code',
                      }}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingModels ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: 'white',
                          fontSize: '0.875rem',
                          backgroundColor: 'rgb(39 39 42)',
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgb(63 63 70)',
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgb(82 82 91)',
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgb(124 58 237)',
                            borderWidth: 2,
                          },
                        },
                      }}
                    />
                  )}
                  sx={{ width: '100%' }}
                  slotProps={{
                    popper: { sx: { zIndex: 15000 } },
                  }}
                  ListboxProps={{
                    sx: {
                      bgcolor: 'rgb(24 24 27)',
                      color: 'white',
                      '& .MuiAutocomplete-option': {
                        '&:hover': { bgcolor: 'rgb(39 39 42)' },
                        '&[aria-selected="true"]': { bgcolor: 'rgb(124 58 237 / 0.3)' },
                      },
                    },
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Open Router API Key</label>
                <input
                  type="password"
                  value={openrouterApiKey}
                  onChange={(e) => setOpenrouterApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          {provider === 'deepseek' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Model (optional)</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  autoComplete="one-time-code"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">DeepSeek API Key</label>
                <input
                  type="password"
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          {provider === 'ollama' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Model</label>
              <select
                value={model || OLLAMA_TOOL_CALLING_MODELS[0]}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {OLLAMA_TOOL_CALLING_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">Tool-calling capable models only.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
