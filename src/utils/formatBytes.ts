/**
 * Format byte count to human-readable string (e.g. "12.3 MiB", "950 KiB").
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  if (bytes < 0 || !Number.isFinite(bytes)) return '0 B';
  if (bytes === 0) return '0 B';

  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  const unit = units[i];
  if (i === 0) return `${value} ${unit}`;
  return `${value.toFixed(1)} ${unit}`;
}
