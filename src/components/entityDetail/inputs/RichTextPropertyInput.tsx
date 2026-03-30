import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { Entity, PropertyDefinition } from '../../../types';
import type { RichTextEditorProps } from '../../richText/richTextEditorTypes';
import { isValidBlockNoteDoc } from '../../../utils/comments';
import { InvalidBlockNoteLogger } from '../InvalidBlockNoteLogger';
import { RichTextEditor } from '../../RichTextEditor';

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

  useEffect(() => {
    setIsEditing(false);
  }, [entityId, prop.name, resetKey]);

  if (!isValuesReady) {
    return (
      <div className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-3 text-sm text-zinc-500">
        Loading...
      </div>
    );
  }
  return (
    <div
      className={`w-full border rounded-md overflow-hidden ${
        isEditing ? 'bg-zinc-900 border-zinc-800' : 'bg-black border-zinc-800'
      } ${isEditing ? '' : 'cursor-pointer'}`}
      onClick={!isEditing ? () => setIsEditing(true) : undefined}
      onKeyDown={
        !isEditing
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsEditing(true);
              }
            }
          : undefined
      }
      role={!isEditing ? 'button' : undefined}
      tabIndex={!isEditing ? 0 : -1}
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
        {isValidBlockNoteDoc(typeof value === 'string' ? value : '') ? (
          <RichTextEditor
            // Re-mount when switching entities so initialContent resets.
            key={`${entityId}:${prop.name}:${resetKey ?? 0}`}
            value={typeof value === 'string' ? value : ''}
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
  );
};
