import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import type { PropertyDefinition } from '../../../types';

type BaseProps = {
  value: any;
  onChange: (value: any) => void;
  prop?: PropertyDefinition;
};

type TextPropertyInputProps = BaseProps & {
  entityId?: string;
  onCommit?: () => void;
};

export const TextPropertyInput = ({ value, onChange, prop, entityId, onCommit }: TextPropertyInputProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textValue = typeof value === 'string' ? value : value == null ? '' : String(value);
  const placeholder = prop?.name ? `Enter ${prop.name}` : 'Click to edit';
  const displayValue = textValue.trim().length > 0 ? textValue : placeholder;

  useEffect(() => {
    setIsEditing(false);
  }, [entityId, prop?.name]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  return (
    <div
      className={`w-full border rounded-md overflow-hidden ${
        isEditing ? 'bg-zinc-900 border-zinc-800' : 'bg-black border-zinc-800'
      } ${isEditing ? '' : 'cursor-pointer'}`}
      onClick={!isEditing ? () => setIsEditing(true) : undefined}
      onKeyDown={
        !isEditing
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsEditing(true);
              }
            }
          : undefined
      }
      role={!isEditing ? 'button' : undefined}
      tabIndex={!isEditing ? 0 : -1}
    >
      {isEditing ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-zinc-900 text-white focus:outline-none"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCommit?.();
              setIsEditing(false);
            }}
            className="p-1 text-zinc-400 hover:text-zinc-200"
            title="Done"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className={`px-3 py-2 ${
            textValue.trim().length > 0 ? 'text-white' : 'text-zinc-500'
          }`}
        >
          {displayValue}
        </div>
      )}
    </div>
  );
};

export const SelectPropertyInput = ({ value, onChange, prop }: BaseProps) => {
  const opts = prop?.options ?? [];
  const strVal = value != null && value !== '' ? String(value) : '';
  const options = opts.includes(strVal) ? opts : strVal ? [strVal, ...opts] : opts;
  return (
    <select
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
};

export const NumberPropertyInput = ({ value, onChange }: BaseProps) => {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
    />
  );
};

const parseDateValue = (v: unknown): dayjs.Dayjs | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = dayjs(v);
    return d.isValid() ? d : null;
  }
  const d = dayjs(String(v));
  return d.isValid() ? d : null;
};

export const DatePropertyInput = ({ value, onChange }: BaseProps) => {
  const dayjsValue = parseDateValue(value);
  return (
    <DatePicker
      value={dayjsValue}
      onChange={(d) => onChange(d ? d.format('YYYY-MM-DD') : '')}
      slotProps={{
        textField: {
          size: 'small',
          fullWidth: true,
          sx: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgb(24 24 27)',
              '& fieldset': { borderColor: 'rgb(39 39 42)' },
              '&:hover fieldset': { borderColor: 'rgb(63 63 70)' },
              '&.Mui-focused fieldset': { borderColor: 'rgb(139 92 246)' },
            },
            '& .MuiInputBase-input': { color: 'white' },
          },
        },
      }}
    />
  );
};

export const BooleanPropertyInput = ({ value, onChange }: BaseProps) => {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value || false}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 bg-zinc-900 border-zinc-800 rounded"
      />
      <span className="text-zinc-400">Enabled</span>
    </label>
  );
};
