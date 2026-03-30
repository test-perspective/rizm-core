import type { MutableRefObject } from 'react';
import type { Entity } from '../../types';

export type RichTextEditorProps = {
  value: string | undefined;
  editable: boolean;
  focusRequest?: { blockId?: string };
  focusRequestToken?: number;
  onChange: (nextDocJson: string) => void;
  className?: string;
  entities?: Entity[];
  onEntityClick?: (entity: Entity) => void;
  attachmentContext?: {
    projectId: string;
    entityPk: string;
    values?: Record<string, any>;
    onServerEntity?: (entity: Entity, etag: string) => void;
  };
  collaboration?: {
    provider: unknown;
    fragment: unknown;
    user?: { name: string; color: string };
    onSnapshot?: (docJson: string, crdtBlob: number[]) => void;
  };
  /** When provided, populated with a function that returns the current doc JSON. Used for collab persist. */
  getDocRef?: MutableRefObject<(() => string) | null>;
};
