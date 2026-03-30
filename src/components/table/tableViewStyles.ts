export const tableGridSx = {
  width: '100%',
  height: '100%',
  minWidth: 0,
  border: 0,
  bgcolor: 'rgb(9 9 11)',
  color: 'rgb(244 244 245)',
  '& .MuiDataGrid-scrollShadow': {
    display: 'none',
  },
  '& .MuiDataGrid-main': {
    height: '100%',
    minHeight: 0,
  },
  '& .MuiDataGrid-virtualScroller': {
    overflowY: 'auto',
  },
  '& .MuiDataGrid-columnHeaders': {
    bgcolor: 'rgb(9 9 11)',
    borderBottom: '1px solid rgb(39 39 42)',
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    color: 'rgb(161 161 170)',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  '& .MuiDataGrid-row': {
    borderBottom: '1px solid rgb(39 39 42)',
  },
  '& .MuiDataGrid-cell': {
    borderBottom: '1px solid rgb(39 39 42)',
    color: 'rgb(212 212 216)',
    fontSize: '0.8125rem',
    display: 'flex',
    alignItems: 'center',
  },
  '& .MuiDataGrid-row:hover': {
    bgcolor: 'rgb(24 24 27)',
  },
  '& .MuiDataGrid-cell--selected, & .MuiDataGrid-cell.Mui-selected': {
    backgroundColor: 'rgb(124 58 237 / 0.18)',
  },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
    outline: '2px solid rgb(124 58 237 / 0.65)',
    outlineOffset: '-2px',
  },
  '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
    outline: 'none',
  },
} as const;

export const tablePaginationSx = {
  bgcolor: 'rgb(9 9 11)',
  color: 'rgb(161 161 170)',
  '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
    color: 'rgb(161 161 170)',
  },
  '& .MuiSvgIcon-root': {
    color: 'rgb(161 161 170)',
  },
  '& .MuiInputBase-root': {
    color: 'rgb(244 244 245)',
  },
  '& .MuiTablePagination-actions button': {
    color: 'rgb(161 161 170)',
  },
} as const;
