import { useMemo, useRef, useState } from 'react';
import { Download, FileText, Paperclip, Play, Trash2, Upload, X } from 'lucide-react';
import type { AttachmentMeta, Entity } from '../../../types';
import { deleteAttachmentApi, fetchAttachmentBlobApi, uploadAttachmentsApi } from '../../../api/attachments';
import { apiBaseUrl } from '../../../auth/api';
import { useAppDialog } from '../../dialogs';
import { buildAttachmentUrl, isPreviewable, parseAttachments } from './attachmentsUtils';

type AttachmentsSectionProps = {
  projectId: string;
  entity: Entity;
  values: Record<string, any>;
  canAttach: boolean;
  onServerEntity: (entity: Entity, etag: string) => void;
  onApplyProperties: (props: Record<string, any>) => void;
};

export const AttachmentsSection = ({
  projectId,
  entity,
  values,
  canAttach,
  onServerEntity,
  onApplyProperties,
}: AttachmentsSectionProps) => {
  const dialog = useAppDialog();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentMeta | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachments = useMemo(() => parseAttachments(values), [values]);
  const attachmentBaseUrl = apiBaseUrl();

  const handleDownloadAttachment = async (a: AttachmentMeta) => {
    setAttachmentError(null);
    setDownloadingId(a.id);
    try {
      const blob = await fetchAttachmentBlobApi(projectId, entity.id, a.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.fileName || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[attachments] download failed', e);
      setAttachmentError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const doUploadFiles = async (files: File[]) => {
    if (!canAttach) return;
    const picked = files.filter((f) => f && typeof f.name === 'string' && f.size > 0);
    if (picked.length === 0) return;
    setAttachmentError(null);
    setIsUploading(true);
    try {
      const { entity: updated, etag } = await uploadAttachmentsApi(projectId, entity.id, picked);
      onServerEntity(updated, etag);
      onApplyProperties(updated.properties ?? {});
    } catch (e) {
      console.error('[attachments] upload failed', e);
      setAttachmentError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setIsDragOver(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!canAttach) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Attachment',
      message: 'Are you sure you want to delete this attachment?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    setAttachmentError(null);
    setIsUploading(true);
    try {
      const { entity: updated, etag } = await deleteAttachmentApi(projectId, entity.id, attachmentId);
      onServerEntity(updated, etag);
      onApplyProperties(updated.properties ?? {});
    } catch (e) {
      console.error('[attachments] delete failed', e);
      setAttachmentError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="pt-6 border-t border-zinc-800 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Paperclip className="w-4 h-4" />
          Attachments
        </h3>
        <div className="text-xs text-zinc-500">
          {attachments.length} file{attachments.length === 1 ? '' : 's'}
        </div>
      </div>

      {attachmentError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {attachmentError}
        </div>
      )}

      <div
        className={[
          'border border-dashed rounded-lg px-4 py-4 transition-colors',
          isDragOver ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 bg-zinc-950',
          canAttach ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed',
        ].join(' ')}
        onClick={() => {
          if (!canAttach || isUploading) return;
          fileInputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!canAttach || isUploading) return;
          setIsDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!canAttach || isUploading) return;
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!canAttach || isUploading) return;
          const files = Array.from(e.dataTransfer.files ?? []);
          void doUploadFiles(files);
        }}
      >
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <Upload className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-zinc-200">
              {canAttach ? 'Drop files here or click to select' : 'Read-only access cannot add/remove attachments'}
            </div>
            <div className="text-xs text-zinc-500">{isUploading ? 'Processing...' : 'Multiple files allowed'}</div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (!canAttach || isUploading) return;
            const files = Array.from(e.target.files ?? []);
            void doUploadFiles(files);
          }}
        />
      </div>

      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {attachments.map((a) => {
            const preview = isPreviewable(a);
            const url = buildAttachmentUrl(attachmentBaseUrl, projectId, entity.id, a.id);
            return (
              <div
                key={a.id}
                className="group relative border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950"
              >
                <button
                  type="button"
                  className="block text-left w-full"
                  title="Click to preview"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewAttachment(a);
                  }}
                >
                  {preview.kind === 'image' ? (
                    <img src={url} alt={a.fileName} className="w-full h-24 object-cover" />
                  ) : preview.kind === 'video' ? (
                    <div className="relative h-24">
                      <video
                        src={url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-24 object-cover pointer-events-none"
                        onLoadedMetadata={(e) => {
                          try {
                            const el = e.currentTarget;
                            if (isFinite(el.duration) && el.duration > 0.2) {
                              el.currentTime = 0.1;
                            }
                          } catch {
                            // ignore
                          }
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="p-2 rounded-full bg-black/50 border border-white/20">
                          <Play className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                  ) : preview.kind === 'pdf' ? (
                    <div className="h-24 flex items-center justify-center text-zinc-400">
                      <span className="text-xs">PDF</span>
                    </div>
                  ) : (
                    <div className="h-24 flex items-center justify-center text-zinc-400">
                      <FileText className="w-6 h-6" />
                    </div>
                  )}
                  <div className="px-2 py-2 border-t border-zinc-800">
                    <div className="text-xs text-zinc-200 truncate">{a.fileName}</div>
                    <div className="text-[11px] text-zinc-500">
                      {a.size ? `${Math.round(a.size / 1024)} KB` : '—'}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleDownloadAttachment(a);
                  }}
                  className={[
                    'absolute top-1 left-1 p-1 rounded-md',
                    'bg-zinc-900/80 border border-zinc-700 text-zinc-200',
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                    downloadingId === a.id ? 'pointer-events-none opacity-50' : '',
                  ].join(' ')}
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>

                {canAttach && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDeleteAttachment(a.id);
                    }}
                    className={[
                      'absolute top-1 right-1 p-1 rounded-md',
                      'bg-zinc-900/80 border border-zinc-700 text-zinc-200',
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                      isUploading ? 'pointer-events-none opacity-40' : '',
                    ].join(' ')}
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewAttachment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPreviewAttachment(null)} />
          <div className="relative w-[min(960px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{previewAttachment.fileName}</div>
                <div className="text-xs text-zinc-500">
                  {previewAttachment.mimeType ? previewAttachment.mimeType : 'unknown'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleDownloadAttachment(previewAttachment)}
                  className="px-3 py-2 text-zinc-200 hover:text-white hover:bg-zinc-900 border border-zinc-800 rounded-md transition-colors flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-md transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto">
              {(() => {
                const url = buildAttachmentUrl(attachmentBaseUrl, projectId, entity.id, previewAttachment.id);
                const kind = isPreviewable(previewAttachment).kind;
                if (kind === 'image') {
                  return (
                    <div className="w-full flex items-center justify-center">
                      <img src={url} alt={previewAttachment.fileName} className="max-w-full max-h-[70vh] object-contain" />
                    </div>
                  );
                }
                if (kind === 'video') {
                  return <video src={url} controls className="w-full max-h-[70vh] bg-black rounded-md" />;
                }
                if (kind === 'pdf') {
                  return (
                    <iframe
                      src={url}
                      title={previewAttachment.fileName}
                      className="w-full h-[70vh] bg-white rounded-md"
                    />
                  );
                }
                return (
                  <div className="text-sm text-zinc-400">
                    This file format cannot be previewed (only images, videos, and PDFs are supported). Please download to view.
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
