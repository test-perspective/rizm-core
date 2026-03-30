import type { AttachmentMeta } from '../../../types';

export const parseAttachments = (values: Record<string, any>): AttachmentMeta[] => {
  const raw = values?.attachments;
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({
      id: String((a as any).id ?? ''),
      fileName: String((a as any).fileName ?? ''),
      mimeType: typeof (a as any).mimeType === 'string' ? String((a as any).mimeType) : undefined,
      size: Number((a as any).size ?? 0),
      createdAt: Number((a as any).createdAt ?? 0),
    }))
    .filter((a) => a.id && a.fileName);
};

export const buildAttachmentUrl = (
  baseUrl: string,
  projectId: string,
  entityId: string,
  attachmentId: string
): string => {
  return `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(
    entityId
  )}/attachments/${encodeURIComponent(attachmentId)}`;
};

export const isPreviewable = (
  a: AttachmentMeta
): { kind: 'image' | 'video' | 'pdf' | 'none' } => {
  const mime = typeof a.mimeType === 'string' ? a.mimeType : '';
  if (mime.startsWith('image/')) return { kind: 'image' };
  if (mime.startsWith('video/')) return { kind: 'video' };
  if (mime === 'application/pdf') return { kind: 'pdf' };
  if (a.fileName.toLowerCase().endsWith('.pdf')) return { kind: 'pdf' };
  return { kind: 'none' };
};
