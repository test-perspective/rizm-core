import { useEffect, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { Entity, PropertyDefinition } from '../../../types';
import type { RichTextEditorProps } from '../../richText/richTextEditorTypes';
import { isValidBlockNoteDoc } from '../../../utils/comments';
import { InvalidBlockNoteLogger } from '../InvalidBlockNoteLogger';
import { RichTextEditor } from '../../RichTextEditor';

/** API may return BlockNote JSON as a string or (if double-parsed) as an array. */
function blockNotePropertyValueToDocString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return '';
}

type RichTextPropertyInputProps = {
  entityId: string;
  prop: PropertyDefinition;
  value: unknown;
  isValuesReady: boolean;
  resetKey?: number;
  entities: Entity[];
  onEntityClick?: (entity: Entity) => void;
  onChange: (value: string) => void;
  onCommit?: () => void;
  attachmentContext?: RichTextEditorProps['attachmentContext'];
};

export const RichTextPropertyInput = ({
  entityId,
  prop,
  value,
  isValuesReady,
  resetKey,
  entities,
  onEntityClick,
  onChange,
  onCommit,
  attachmentContext,
}: RichTextPropertyInputProps) => {
  const [isEditing, setIsEditing] = useState(false);
  /** Collapse rich text body in entity detail read mode (not wiki pages); default open; not persisted. */
  const [contentExpanded, setContentExpanded] = useState(true);

  useEffect(() => {
    setIsEditing(false);
    setContentExpanded(true);
  }, [entityId, prop.name, resetKey]);

  const fieldLabelRow = (
    <div className="flex items-center justify-between gap-2 mb-2 min-h-0">
      <label className="text-sm font-medium text-zinc-400 capitalize min-w-0 truncate">{prop.name}</label>
      {!isValuesReady ? null : !isEditing ? (
        <button
          type="button"
          data-testid="richtext-property-content-toggle"
          aria-expanded={contentExpanded}
          aria-label={`Toggle ${prop.name}`}
          title={`Toggle ${prop.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setContentExpanded((v) => !v);
          }}
          className="shrink-0 p-0.5 rounded-md text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          {contentExpanded ? (
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );

  if (!isValuesReady) {
    return (
      <div className="w-full">
        {fieldLabelRow}
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-3 text-sm text-zinc-500">
          Loading...
        </div>
      </div>
    );
  }
  const readModeActivateHandlers =
    !isEditing && contentExpanded
      ? {
          onClick: () => setIsEditing(true),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsEditing(true);
            }
          },
          role: 'button' as const,
          tabIndex: 0 as const,
        }
      : {};

  return (
    <div className="w-full flex flex-col">
      {fieldLabelRow}

      {(isEditing || contentExpanded) && (
        <div
          data-testid={!isEditing && contentExpanded ? 'richtext-property-read-body' : undefined}
          className={`w-full border rounded-md overflow-hidden ${
            isEditing ? 'bg-zinc-900 border-zinc-800' : 'bg-black border-zinc-800'
          } ${isEditing ? '' : 'cursor-pointer'}`}
          {...readModeActivateHandlers}
        >
          {isEditing && (
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommit?.();
                  setIsEditing(false);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-200"
                title="Done"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className={`p-3 ${isEditing ? 'bg-zinc-900' : 'bg-black'}`}>
            {isValidBlockNoteDoc(blockNotePropertyValueToDocString(value)) ? (
              <RichTextEditor
                // Re-mount when switching entities so initialContent resets.
                key={`${entityId}:${prop.name}:${resetKey ?? 0}`}
                value={blockNotePropertyValueToDocString(value)}
                editable={isEditing}
                onChange={isEditing ? (docJson) => onChange(docJson) : () => {}}
                className={
                  isEditing
                    ? 'bg-zinc-900 [&_.bn-editor]:!bg-zinc-900 [&_.bn-container]:!bg-zinc-900'
                    : 'bg-black [&_.bn-editor]:!bg-black [&_.bn-container]:!bg-black'
                }
                entities={entities}
                onEntityClick={onEntityClick}
                attachmentContext={attachmentContext}
              />
            ) : (
              <>
                {typeof window !== 'undefined' && (
                  <InvalidBlockNoteLogger source="property" propName={prop.name} raw={value} />
                )}
                <div className="text-sm text-zinc-500 italic">
                  Content could not be displayed (imported content may use unsupported format).
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
