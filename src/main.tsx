import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/ariakit/style.css';
import './blocknoteOverrides.css';
import { CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid-premium/themeAugmentation';
import { initMuiXLicense } from './mui/license';

// Initialize MUI X license at app startup
initMuiXLicense();

const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: 'rgb(9 9 11)', // zinc-950
      paper: 'rgb(9 9 11)',
    },
    primary: {
      main: 'rgb(124 58 237)', // violet-600
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: 'rgb(9 9 11)',
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 0,
          backgroundColor: 'rgb(9 9 11)',
          color: 'rgb(244 244 245)', // zinc-100
        },
        columnHeaders: {
          backgroundColor: 'rgb(9 9 11)',
          borderBottom: '1px solid rgb(39 39 42)', // zinc-800
        },
        cell: {
          borderBottom: '1px solid rgb(39 39 42)',
          outline: 'none',
        },
        row: {
          borderBottom: '1px solid rgb(39 39 42)',
        },
        footerContainer: {
          borderTop: '1px solid rgb(39 39 42)',
          backgroundColor: 'rgb(9 9 11)',
          color: 'rgb(161 161 170)', // zinc-400
        },
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
