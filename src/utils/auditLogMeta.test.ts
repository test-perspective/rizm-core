import { describe, expect, it } from 'vitest';
import { formatAuditLogMeta } from './auditLogMeta';

describe('formatAuditLogMeta', () => {
  it('returns em-dash for null or empty', () => {
    expect(formatAuditLogMeta(null)).toBe('—');
    expect(formatAuditLogMeta('')).toBe('—');
    expect(formatAuditLogMeta('   ')).toBe('—');
  });

  it('returns raw string for invalid JSON', () => {
    const raw = 'not json {';
    expect(formatAuditLogMeta(raw)).toBe(raw);
  });

  it('formats changes with from/to for simple fields and includes task identification', () => {
    const meta = JSON.stringify({
      entity_type: 'TASK',
      entity_id: 'e1',
      entity_title: 'REQ-1 Fix bug',
      changes: {
        status: { from: 'Todo', to: 'Done' },
        title: { from: 'Old', to: 'New' },
      },
    });
    const result = formatAuditLogMeta(meta);
    expect(result).toContain('Task: REQ-1 Fix bug (e1)');
    expect(result).toContain('status:');
    expect(result).toContain('Todo');
    expect(result).toContain('Done');
    expect(result).toContain('title:');
    expect(result).toContain('Old');
    expect(result).toContain('New');
  });

  it('skips unchanged changes', () => {
    const meta = JSON.stringify({
      changes: {
        status: { from: 'Todo', to: 'Todo' },
      },
    });
    const result = formatAuditLogMeta(meta);
    expect(result).toBe('—');
  });

  it('formats metadata without changes as key-value summary', () => {
    const meta = JSON.stringify({
      entity_type: 'TASK',
      entity_id: 'e1',
      entity_title: 'My Task',
      project_id: 'p1',
    });
    const result = formatAuditLogMeta(meta);
    expect(result).toContain('entity_type: TASK');
    expect(result).toContain('entity_title: My Task');
    expect(result).toContain('project_id: p1');
  });

  it('formats long text (doc) as line diff only, truncates long lines', () => {
    const meta = JSON.stringify({
      entity_type: 'WIKI',
      entity_id: 'w1',
      entity_title: 'Notes',
      changes: {
        doc: {
          from: 'line1\nline2',
          to: 'line1\nline2\nline3',
        },
      },
    });
    const result = formatAuditLogMeta(meta);
    expect(result).toContain('Wiki: Notes (w1)');
    expect(result).toContain('doc:');
    expect(result).toContain('+ line3');
  });

  it('shows "formatting only" when plain text is identical but JSON differs (doc)', () => {
    const sameText = 'Hello world';
    const fromJson = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: sameText, styles: {} }], children: [] }]);
    const toJson = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: sameText, styles: { bold: true } }], children: [] }]);
    const meta = JSON.stringify({
      changes: { doc: { from: fromJson, to: toJson } },
    });
    const result = formatAuditLogMeta(meta);
    expect(result).toContain('formatting only');
    expect(result).toContain('text unchanged');
  });

  it('truncates very long single-line diff', () => {
    const longLine = 'x'.repeat(500);
    const meta = JSON.stringify({
      changes: {
        doc: { from: longLine, to: longLine + 'y' },
      },
    });
    const result = formatAuditLogMeta(meta);
    expect(result).toContain('doc:');
    expect(result.length).toBeLessThan(600);
  });

  it('formats comments array as text for diff', () => {
    const meta = JSON.stringify({
      changes: {
        comments: {
          from: [],
          to: [
            {
              id: 'c1',
              createdAt: 1000,
              doc: JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }], children: [] }]),
            },
          ],
        },
      },
    });
    const result = formatAuditLogMeta(meta);
    expect(result).toContain('comments:');
    expect(result).toContain('Hello');
  });
});
