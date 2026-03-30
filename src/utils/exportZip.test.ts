import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { StorageData } from '../types';
import { buildBackupZip, buildEntitiesCsv, escapeCsvCell, toCsv } from './exportZip';

describe('exportZip utils', () => {
  it('escapeCsvCell quotes commas, newlines, and double quotes', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
  });

  it('toCsv emits BOM by default', () => {
    const csv = toCsv([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('buildEntitiesCsv unions property keys as columns', () => {
    const csv = buildEntitiesCsv([
      { id: 'r1', entityId: 'task', createdAt: 1, updatedAt: 2, properties: { a: 1, b: 2 } },
      { id: 'r2', entityId: 'task', createdAt: 3, updatedAt: 4, properties: { b: 3, c: 4 } },
    ]);
    // header line (BOM + header)
    expect(csv).toContain('recordId,createdAt,updatedAt,a,b,c');
    expect(csv).toContain('r1,1,2,1,2,');
    expect(csv).toContain('r2,3,4,,3,4');
  });

  it('buildBackupZip contains state.json, projects.csv, and per-entity CSVs', async () => {
    const sample: StorageData = {
      version: 1,
      activeProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          createdAt: 10,
          updatedAt: 11,
          entities: [
            { id: 'e1', entityId: 'task', createdAt: 1, updatedAt: 2, properties: { title: 't' } },
            { id: 'e2', entityId: 'wikiPage', createdAt: 3, updatedAt: 4, properties: { title: 'w', doc: '{"x":1}' } },
          ],
          config: { manifest: { name: 'M', entities: [], views: [], defaultView: 'list' } },
        },
      ],
    };

    const blob = await buildBackupZip(sample);
    const zip = await JSZip.loadAsync(blob);

    expect(zip.file('state.json')).toBeTruthy();
    expect(zip.file('projects.csv')).toBeTruthy();
    expect(zip.file('manifest/p1.json')).toBeTruthy();
    expect(zip.file('entities/p1/task.csv')).toBeTruthy();
    expect(zip.file('entities/p1/wikiPage.csv')).toBeTruthy();
  });
});

