import JSZip from 'jszip';
import type { Entity, Project, StorageData } from '../types';

const CSV_BOM = '\uFEFF';

const safeFileSegment = (segment: string): string => segment.replace(/[\\/:*?"<>|]/g, '_');

export const makeBackupZipFilename = (now: Date = new Date()): string => {
  // Windows-friendly + sortable-ish
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return `keel-backup-${iso}.zip`;
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
};

const stringifyCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const escapeCsvCell = (cell: string): string => {
  // RFC4180-ish
  const needsQuoting = /[",\r\n]/.test(cell);
  if (!needsQuoting) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
};

export const toCsv = (rows: string[][], opts?: { bom?: boolean }): string => {
  const bom = opts?.bom ?? true;
  const body = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
  return (bom ? CSV_BOM : '') + body + '\r\n';
};

const buildProjectsCsv = (projects: Project[]): string => {
  const rows: string[][] = [
    ['id', 'name', 'createdAt', 'updatedAt'],
    ...projects.map((p) => [p.id, p.name, String(p.createdAt), String(p.updatedAt)]),
  ];
  return toCsv(rows);
};

export const buildEntitiesCsv = (entities: Entity[]): string => {
  const keys = Array.from(
    entities.reduce((acc, e) => {
      Object.keys(e.properties ?? {}).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>())
  ).sort((a, b) => a.localeCompare(b));

  const header = ['recordId', 'createdAt', 'updatedAt', ...keys];
  const rows: string[][] = [
    header,
    ...entities.map((e) => [
      e.id,
      String(e.createdAt),
      String(e.updatedAt),
      ...keys.map((k) => stringifyCellValue((e.properties ?? {})[k])),
    ]),
  ];
  return toCsv(rows);
};

export async function buildBackupZip(storageData: StorageData): Promise<Blob> {
  const zip = new JSZip();

  // Lossless restore payload
  zip.file('state.json', JSON.stringify(storageData, null, 2));

  zip.file('projects.csv', buildProjectsCsv(storageData.projects));

  // Optional readability: per-project manifest JSON
  for (const p of storageData.projects) {
    zip.file(`manifest/${safeFileSegment(p.id)}.json`, JSON.stringify(p.config?.manifest ?? null, null, 2));
  }

  // entities/<projectId>/<entityId>.csv
  for (const p of storageData.projects) {
    const byEntityId = new Map<string, Entity[]>();
    for (const e of p.entities ?? []) {
      const list = byEntityId.get(e.entityId) ?? [];
      list.push(e);
      byEntityId.set(e.entityId, list);
    }
    for (const [entityId, list] of byEntityId.entries()) {
      zip.file(
        `entities/${safeFileSegment(p.id)}/${safeFileSegment(entityId)}.csv`,
        buildEntitiesCsv(list)
      );
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

