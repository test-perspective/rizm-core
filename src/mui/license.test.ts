import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LicenseInfo } from '@mui/x-license';

vi.mock('@mui/x-license', () => ({
  LicenseInfo: {
    setLicenseKey: vi.fn(),
  },
}));

async function loadInitMuiXLicense() {
  vi.resetModules();
  const mod = await import('./license');
  return mod.initMuiXLicense;
}

describe('MUI X License initialization', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('does not call setLicenseKey when VITE_MUI_X_LICENSE_KEY is unset', async () => {
    const initMuiXLicense = await loadInitMuiXLicense();
    initMuiXLicense();
    expect(LicenseInfo.setLicenseKey).not.toHaveBeenCalled();
  });

  it('does not call setLicenseKey when VITE_MUI_X_LICENSE_KEY is empty or whitespace-only', async () => {
    vi.stubEnv('VITE_MUI_X_LICENSE_KEY', '');
    const initEmpty = await loadInitMuiXLicense();
    initEmpty();
    expect(LicenseInfo.setLicenseKey).not.toHaveBeenCalled();

    vi.clearAllMocks();
    vi.stubEnv('VITE_MUI_X_LICENSE_KEY', '  \t\n  ');
    const initWs = await loadInitMuiXLicense();
    initWs();
    expect(LicenseInfo.setLicenseKey).not.toHaveBeenCalled();
  });

  it('calls setLicenseKey once with trimmed key when VITE_MUI_X_LICENSE_KEY is non-empty', async () => {
    vi.stubEnv('VITE_MUI_X_LICENSE_KEY', '  test-license-key  ');
    const initMuiXLicense = await loadInitMuiXLicense();
    initMuiXLicense();

    expect(LicenseInfo.setLicenseKey).toHaveBeenCalledTimes(1);
    expect(LicenseInfo.setLicenseKey).toHaveBeenCalledWith('test-license-key');
  });
});
