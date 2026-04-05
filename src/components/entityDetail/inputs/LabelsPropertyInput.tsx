import { useMemo, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import type { PropertyDefinition } from '../../../types';
import { TagPill } from '../../common/TagPill';
import {
  buildLabelOptionsWithRecent,
  labelAutocompletePassthroughFilterOptions,
  recordRecentLabels,
} from '../../../utils/recentLabels';

type LabelsPropertyInputProps = {
  value: any;
  prop: PropertyDefinition;
  entityTypeId: string;
  onChange: (value: string[]) => void;
  onUpsertPropertyOption?: (entityTypeId: string, propName: string, option: string) => void;
};

export const LabelsPropertyInput = ({
  value,
  prop,
  entityTypeId,
  onChange,
  onUpsertPropertyOption,
}: LabelsPropertyInputProps) => {
  const [inputValue, setInputValue] = useState('');
  const currentValues = useMemo(() => {
    if (!Array.isArray(value)) return [];
    return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
  }, [value]);

  const normalizedOptions = useMemo(
    () => (prop.options ?? []).map((opt) => opt.trim()).filter((opt) => opt.length > 0),
    [prop.options]
  );

  const maxOptionsDisplay = 5;
  const displayOptions = useMemo(() => {
    return buildLabelOptionsWithRecent({
      entityTypeId,
      propName: prop.name,
      options: normalizedOptions,
      inputValue,
      maxOptionsDisplay,
    });
  }, [entityTypeId, prop.name, normalizedOptions, inputValue]);

  const handleChange = (_event: React.SyntheticEvent, newValue: string[]) => {
    const next = newValue.map((v) => v.trim()).filter((v) => v.length > 0);
    const created = next.filter((label) => !normalizedOptions.includes(label));
    const added = next.filter((label) => !currentValues.includes(label));
    if (added.length > 0) {
      recordRecentLabels(entityTypeId, prop.name, added);
    }
    if (created.length > 0 && onUpsertPropertyOption) {
      created.forEach((label) => onUpsertPropertyOption(entityTypeId, prop.name, label));
    }
    onChange(next);
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      value={currentValues}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={(_event, nextValue) => setInputValue(nextValue)}
      options={displayOptions}
      filterOptions={labelAutocompletePassthroughFilterOptions}
      filterSelectedOptions
      renderTags={(value, getTagProps) =>
        value.map((option, index) => {
          const { key, onDelete, ...tagProps } = getTagProps({ index });
          return (
            <span key={key} {...tagProps} className="flex items-center gap-1 pr-1">
              <TagPill value={option} />
              <button
                type="button"
                onClick={onDelete}
                className="text-zinc-400 hover:text-zinc-200"
                title="Remove"
              >
                ×
              </button>
            </span>
          );
        })
      }
      renderOption={(optionProps, option) => (
        <li {...optionProps} key={option}>
          <TagPill value={option} />
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          size="small"
          placeholder="Add labels..."
          InputProps={{
            ...params.InputProps,
            disableUnderline: true,
          }}
          sx={{
            '& .MuiInputBase-root': {
              color: 'white',
              fontSize: '0.875rem',
            },
          }}
        />
      )}
      sx={{
        width: '100%',
        minHeight: '42px',
        bgcolor: 'rgb(9 9 11)',
        border: '1px solid rgb(39 39 42)',
        borderRadius: '0.375rem',
        padding: '4px 8px',
        '&:focus-within': {
          boxShadow: '0 0 0 2px rgb(124 58 237 / 0.65)',
          borderColor: 'rgb(124 58 237 / 0.65)',
        },
        '& .MuiAutocomplete-inputRoot': {
          padding: 0,
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
      slotProps={{
        popper: {
          sx: { zIndex: 9999 },
        },
      }}
    />
  );
};
