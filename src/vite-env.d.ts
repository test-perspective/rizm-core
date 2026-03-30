/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  /** MUI X Premium license key (optional; build-time only). */
  readonly VITE_MUI_X_LICENSE_KEY?: string;
}
