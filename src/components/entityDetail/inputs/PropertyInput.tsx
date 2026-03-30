import type { Entity, PropertyDefinition, UserSummary } from '../../../types';
import type { RichTextEditorProps } from '../../richText/richTextEditorTypes';
import {
  BooleanPropertyInput,
  DatePropertyInput,
  NumberPropertyInput,
  SelectPropertyInput,
  TextPropertyInput,
} from './basicInputs';
import { RichTextPropertyInput } from './RichTextPropertyInput';
import { LinkPropertyInput } from './LinkPropertyInput';
import { UserPropertyInput } from './UserPropertyInput';
import { LabelsPropertyInput } from './LabelsPropertyInput';

type PropertyInputProps = {
  entityId: string;
  entityTypeId: string;
  prop: PropertyDefinition;
  value: any;
  isValuesReady: boolean;
  resetKey?: number;
  entities: Entity[];
  usersById: Record<string, UserSummary>;
  onEntityClick?: (entity: Entity) => void;
  onResolveUsers?: (userIds: string[]) => void;
  onUpsertPropertyOption?: (entityTypeId: string, propName: string, option: string) => void;
  onChange: (value: any) => void;
  onCommit?: (propName: string) => void;
  richtextAttachmentContext?: RichTextEditorProps['attachmentContext'];
};

export const PropertyInput = ({
  entityId,
  entityTypeId,
  prop,
  value,
  isValuesReady,
  resetKey,
  entities,
  usersById,
  onEntityClick,
  onResolveUsers,
  onUpsertPropertyOption,
  onChange,
  onCommit,
  richtextAttachmentContext,
}: PropertyInputProps) => {
  switch (prop.type) {
    case 'text':
      return (
        <TextPropertyInput
          entityId={entityId}
          value={value}
          onChange={onChange}
          prop={prop}
          onCommit={() => onCommit?.(prop.name)}
        />
      );
    case 'richtext':
      return (
        <RichTextPropertyInput
          entityId={entityId}
          prop={prop}
          value={value}
          isValuesReady={isValuesReady}
          resetKey={resetKey}
          entities={entities}
          onEntityClick={onEntityClick}
          onChange={onChange}
          onCommit={() => onCommit?.(prop.name)}
          attachmentContext={richtextAttachmentContext}
        />
      );
    case 'select':
      return <SelectPropertyInput value={value} onChange={onChange} prop={prop} />;
    case 'labels':
      return (
        <LabelsPropertyInput
          value={value}
          prop={prop}
          entityTypeId={entityTypeId}
          onChange={onChange}
          onUpsertPropertyOption={onUpsertPropertyOption}
        />
      );
    case 'number':
      return <NumberPropertyInput value={value} onChange={onChange} />;
    case 'date':
      return <DatePropertyInput value={value} onChange={onChange} />;
    case 'boolean':
      return <BooleanPropertyInput value={value} onChange={onChange} />;
    case 'link':
      return (
        <LinkPropertyInput
          value={value}
          entities={entities}
          currentEntityId={entityId}
          onEntityClick={onEntityClick}
          onChange={(next) => onChange(next)}
        />
      );
    case 'user':
      return (
        <UserPropertyInput
          value={value}
          usersById={usersById}
          onResolveUsers={onResolveUsers}
          onChange={(next) => onChange(next)}
        />
      );
    default:
      return null;
  }
};
