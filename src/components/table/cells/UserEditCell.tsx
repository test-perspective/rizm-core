import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserSummary } from '../../../types';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';
import { GridRenderEditCellParams, useGridApiContext } from '@mui/x-data-grid-premium';
import { searchUsersApi } from '../../../api/users';
import { UserAvatar } from '../../UserAvatar';
import { getUserDisplayName } from '../../../utils/userDisplay';

type UserEditCellProps = GridRenderEditCellParams & {
  usersById: Record<string, UserSummary>;
  onResolveUsers?: (userIds: string[]) => void;
};

export function UserEditCell(props: UserEditCellProps) {
  const { id, value, field, usersById, onResolveUsers } = props;
  const apiRef = useGridApiContext();
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUser = typeof value === 'string' && value ? usersById[value] : null;

  const searchUsers = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const users = await searchUsersApi(query, 20);
      setOptions(users);
    } catch (e) {
      console.error('Failed to search users:', e);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    searchUsers('');
  }, [searchUsers]);

  const handleInputChange = (_event: React.SyntheticEvent, newInputValue: string) => {
    setInputValue(newInputValue);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(newInputValue);
    }, 300);
  };

  const handleChange = async (_event: React.SyntheticEvent, newValue: UserSummary | null) => {
    const isValid = await apiRef.current.setEditCellValue({ id, field, value: newValue?.id ?? null });
    if (isValid) {
      if (newValue && onResolveUsers) {
        onResolveUsers([newValue.id]);
      }
      apiRef.current.stopCellEditMode({ id, field });
    }
  };

  return (
    <Autocomplete
      disablePortal={false}
      value={currentUser}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      options={options}
      loading={loading}
      getOptionLabel={(option) => getUserDisplayName(option.email)}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      renderOption={(optionProps, option) => (
        <li {...optionProps} key={option.id}>
          <div className="flex items-center gap-2 py-1">
            <UserAvatar email={option.email} size="sm" />
            <span className="text-sm">{getUserDisplayName(option.email)}</span>
            <span className="text-xs text-gray-400 ml-auto">{option.email}</span>
          </div>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          size="small"
          placeholder="Search..."
          autoFocus
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
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
        height: '100%',
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
