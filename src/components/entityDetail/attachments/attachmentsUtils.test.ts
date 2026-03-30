import { describe, it, expect } from 'vitest';
import type { AttachmentMeta } from '../../../types';
import { parseAttachments, isPreviewable, buildAttachmentUrl } from './attachmentsUtils';

describe('attachmentsUtils', () => {
  it('parses attachments from raw values', () => {
    const values = {
      attachments: [{ id: '1', fileName: 'a.txt', size: 10, createdAt: 1 }],
    };
    expect(parseAttachments(values)).toEqual([
      { id: '1', fileName: 'a.txt', size: 10, createdAt: 1, mimeType: undefined },
    ]);
  });

  it('filters invalid attachments', () => {
    const values = { attachments: [{ id: '', fileName: 'a.txt' }, null, {}] };
    expect(parseAttachments(values)).toEqual([]);
  });

  it('detects previewable file types', () => {
    const img: AttachmentMeta = { id: '1', fileName: 'a.png', mimeType: 'image/png', size: 0, createdAt: 0 };
    const pdf: AttachmentMeta = { id: '2', fileName: 'a.pdf', mimeType: undefined, size: 0, createdAt: 0 };
    expect(isPreviewable(img)).toEqual({ kind: 'image' });
    expect(isPreviewable(pdf)).toEqual({ kind: 'pdf' });
  });

  it('builds attachment URL with encoded parts', () => {
    const url = buildAttachmentUrl('https://example.local', 'p 1', 'e/1', 'a#1');
    expect(url).toBe('https://example.local/api/projects/p%201/entities/e%2F1/attachments/a%231');
  });
});
