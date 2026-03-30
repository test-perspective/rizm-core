export function getAppVersion(): string {
  // Injected at build time via vite.config.ts
  return import.meta.env.VITE_APP_VERSION ?? 'unknown';
}

