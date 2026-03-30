export const getMaxPage = (totalRows: number, rowsPerPage: number): number => {
  if (rowsPerPage <= 0) return 0;
  return Math.max(0, Math.ceil(totalRows / rowsPerPage) - 1);
};

export const clampPage = (page: number, totalRows: number, rowsPerPage: number): number => {
  const maxPage = getMaxPage(totalRows, rowsPerPage);
  if (page < 0) return 0;
  if (page > maxPage) return maxPage;
  return page;
};

export const getPageAfterFilterChange = (totalRows: number, rowsPerPage: number): number => {
  return clampPage(0, totalRows, rowsPerPage);
};
