import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { GridRenderEditCellParams, useGridApiContext } from '@mui/x-data-grid-premium';
import dayjs from 'dayjs';

const parseDateValue = (v: unknown): dayjs.Dayjs | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = dayjs(v);
    return d.isValid() ? d : null;
  }
  const d = dayjs(String(v));
  return d.isValid() ? d : null;
};

export function DateEditCell(props: GridRenderEditCellParams) {
  const { id, value, field } = props;
  const apiRef = useGridApiContext();
  const dayjsValue = parseDateValue(value);

  const handleChange = async (d: dayjs.Dayjs | null) => {
    const strValue = d ? d.format('YYYY-MM-DD') : '';
    const isValid = await apiRef.current.setEditCellValue({ id, field, value: strValue });
    if (isValid) {
      apiRef.current.stopCellEditMode({ id, field });
    }
  };

  return (
    <DatePicker
      value={dayjsValue}
      onChange={handleChange}
      slotProps={{
        textField: {
          size: 'small',
          fullWidth: true,
          autoFocus: true,
          sx: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgb(24 24 27)',
              '& fieldset': { borderColor: 'rgb(39 39 42)' },
              '&:hover fieldset': { borderColor: 'rgb(63 63 70)' },
              '&.Mui-focused fieldset': { borderColor: 'rgb(139 92 246)' },
            },
            '& .MuiInputBase-input': { color: 'white', fontSize: '0.875rem' },
          },
        },
        popper: {
          sx: { zIndex: 15000 },
        },
      }}
      sx={{ width: '100%' }}
    />
  );
}
