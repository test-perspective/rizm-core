import { useMemo, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { GridRenderEditCellParams, useGridApiContext } from '@mui/x-data-grid-premium';
import { TagPill } from '../../common/TagPill';
import {
  buildLabelOptionsWithRecent,
  labelAutocompletePassthroughFilterOptions,
  recordRecentLabels,
} from '../../../utils/recentLabels';

type LabelsEditCellProps = GridRenderEditCellParams & {
  options: string[];
  entityTypeId: string;
  onUpsertPropertyOption?: (entityTypeId: string, propName: string, option: string) => void;
};

const parseLabelsText = (text: string): string[] =>
  text
    .split(/[,\n\r\t;]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

export function LabelsEditCell(props: LabelsEditCellProps) {
  const { id, value, field, options, entityTypeId, onUpsertPropertyOption } = props;
  const apiRef = useGridApiContext();
  const [inputValue, setInputValue] = useState('');

  const currentValues = useMemo(() => {
    if (!Array.isArray(value)) return [];
    return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
  }, [value]);

  const normalizedOptions = useMemo(
    () => options.map((opt) => opt.trim()).filter((opt) => opt.length > 0),
    [options]
  );

  const maxOptionsDisplay = 5;
  const displayOptions = useMemo(() => {
    return buildLabelOptionsWithRecent({
      entityTypeId,
      propName: field,
      options: normalizedOptions,
      inputValue,
      maxOptionsDisplay,
    });
  }, [entityTypeId, field, normalizedOptions, inputValue]);

  const handleChange = async (_event: React.SyntheticEvent, newValue: string[]) => {
    const next = newValue.map((v) => v.trim()).filter((v) => v.length > 0);
    const created = next.filter((label) => !normalizedOptions.includes(label));
    const added = next.filter((label) => !currentValues.includes(label));
    if (added.length > 0) {
      recordRecentLabels(entityTypeId, field, added);
    }
    if (created.length > 0 && onUpsertPropertyOption) {
      created.forEach((label) => onUpsertPropertyOption(entityTypeId, field, label));
    }
    await apiRef.current.setEditCellValue({ id, field, value: next });
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData('text');
    const parsed = parseLabelsText(pastedText);
    if (parsed.length <= 1) return;
    event.preventDefault();
    const added = parsed.filter((label, index, all) => all.indexOf(label) === index && !currentValues.includes(label));
    if (added.length > 0) {
      recordRecentLabels(entityTypeId, field, added);
    }
    const merged = Array.from(new Set([...currentValues, ...parsed]));
    await apiRef.current.setEditCellValue({ id, field, value: merged });
    setInputValue('');
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      disablePortal={false}
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
          autoFocus
          onPaste={handlePaste}
          sx={{
            '& .MuiInputBase-root': {
              color: 'white',
              fontSize: '0.875rem',
            },
            '& .MuiInput-underline:before': {
              borderBottomColor: 'rgb(63 63 70)',
            },
            '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
              borderBottomColor: 'rgb(124 58 237)',
            },
          }}
        />
      )}
      sx={{
        width: '100%',
        minHeight: '100%',
        '& .MuiAutocomplete-inputRoot': {
          padding: '4px 8px',
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
          sx: { zIndex: 15000 },
        },
      }}
    />
  );
}
