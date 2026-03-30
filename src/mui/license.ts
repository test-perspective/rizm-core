import { LicenseInfo } from '@mui/x-license';

/**
 * Reads the MUI X Premium license key from the Vite build-time env.
 * Do not commit keys; use `.env.local` or Docker `--build-arg` at build time.
 */
function readMuiXLicenseKeyFromEnv(): string {
  const raw = import.meta.env.VITE_MUI_X_LICENSE_KEY;
  if (raw === undefined || raw === null) {
    return '';
  }
  return String(raw).trim();
}

/**
 * Initialize the MUI X license when a non-empty key is configured.
 * Call once at app startup.
 */
export function initMuiXLicense(): void {
  const key = readMuiXLicenseKeyFromEnv();
  if (key) {
    LicenseInfo.setLicenseKey(key);
  }
}
