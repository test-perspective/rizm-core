import { useCallback, useEffect, useRef, useState } from 'react';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';
import { fetchBitbucketBranches } from '../../api/scm';

const DEBOUNCE_MS = 400;
const RECENT_BRANCHES_KEY = 'keel:recent-branches';
const RECENT_BRANCHES_MAX = 5;

function getRecentBranches(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(`${RECENT_BRANCHES_KEY}:${projectId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentBranch(projectId: string, branch: string): void {
  if (!branch.trim()) return;
  const recent = getRecentBranches(projectId).filter((b) => b !== branch);
  recent.unshift(branch);
  try {
    localStorage.setItem(
      `${RECENT_BRANCHES_KEY}:${projectId}`,
      JSON.stringify(recent.slice(0, RECENT_BRANCHES_MAX))
    );
  } catch {
    // ignore
  }
}

type BranchSelectProps = {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  /** When setting initial value, skip branches matching this (e.g. source branch for PR destination) */
  excludeFromInitial?: string;
  label?: string;
  'aria-label'?: string;
};

export function BranchSelect({
  projectId,
  value,
  onChange,
  disabled = false,
  loading: externalLoading = false,
  onLoadingChange,
  excludeFromInitial,
  label = 'Base Branch',
  'aria-label': ariaLabel,
}: BranchSelectProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFetchedRef = useRef(false);
  const fetchIdRef = useRef(0);
  const valueRef = useRef(value);
  const inputValueRef = useRef(inputValue);
  valueRef.current = value;
  inputValueRef.current = inputValue;

  const fetchBranches = useCallback(
    async (q?: string) => {
      const thisFetchId = ++fetchIdRef.current;
      setLoading(true);
      onLoadingChange?.(true);
      try {
        const res = await fetchBitbucketBranches(projectId, q ? { q } : undefined);
        if (thisFetchId !== fetchIdRef.current) return;
        const fromApi = res.branches;
        const recent = q ? [] : getRecentBranches(projectId);
        const merged = [...new Set([...recent.filter((r) => fromApi.includes(r)), ...fromApi])];
        setOptions(merged);
        if (!q && !initialFetchedRef.current) {
          initialFetchedRef.current = true;
          const userTyped = inputValueRef.current?.trim();
          if (!valueRef.current && !userTyped) {
            const exclude = excludeFromInitial?.trim();
            const ok = (c: string) => !exclude || c !== exclude;
            const initial =
              (res.mainbranch && ok(res.mainbranch) ? res.mainbranch : null) ??
              (res.branches.includes('main') && ok('main') ? 'main' : null) ??
              (res.branches.includes('master') && ok('master') ? 'master' : null) ??
              res.branches.find(ok) ??
              res.branches[0];
            if (initial) {
              onChange(initial);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load branches:', e);
        setOptions([]);
      } finally {
        setLoading(false);
        onLoadingChange?.(false);
      }
    },
    [projectId, onChange, onLoadingChange, excludeFromInitial]
  );

  const handleInputChange = (
    _event: React.SyntheticEvent,
    newInputValue: string,
    reason: string
  ) => {
    if (
      (reason === 'reset' || reason === 'blur') &&
      newInputValue === value &&
      inputValueRef.current !== value
    ) {
      return;
    }
    inputValueRef.current = newInputValue;
    setInputValue(newInputValue);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchBranches(newInputValue.trim() || undefined);
    }, DEBOUNCE_MS);
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: string | null) => {
    const v = newValue ?? '';
    onChange(v);
    if (v) saveRecentBranch(projectId, v);
  };

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const isLoading = loading || externalLoading;

  const displayOptions =
    value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-zinc-400">{label}</label>
        {isLoading && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <CircularProgress color="inherit" size={12} aria-hidden />
            Loading branches...
          </span>
        )}
      </div>
      <Autocomplete
        value={value || null}
        onChange={handleChange}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        options={displayOptions}
        loading={loading}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={(_, _reason) => {
          if (loading) return;
          setOpen(false);
        }}
        openOnFocus
        filterOptions={(x) => x}
        getOptionLabel={(option) => (typeof option === 'string' ? option : '')}
        isOptionEqualToValue={(option, val) => option === val}
        disabled={disabled}
        aria-label={ariaLabel}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            size="small"
            placeholder="Search or select branch..."
            InputProps={{
              ...params.InputProps,
              sx: {
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
        sx={{
          width: '100%',
          '& .MuiAutocomplete-inputRoot': {
            padding: '4px 9px',
          },
        }}
        slotProps={{
          popper: {
            sx: { zIndex: 15000 },
          },
        }}
        ListboxProps={{
          sx: {
            bgcolor: 'rgb(24 24 27)',
            color: 'white',
            '& .MuiAutocomplete-option': {
              '&:hover': {
                bgcolor: 'rgb(39 39 42)',
              },
              '&[aria-selected="true"]': {
                bgcolor: 'rgb(124 58 237 / 0.3)',
              },
            },
          },
        }}
      />
    </div>
  );
}
