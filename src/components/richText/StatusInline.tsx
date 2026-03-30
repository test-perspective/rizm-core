import { createReactInlineContentSpec } from '@blocknote/react';
import { useStatusEditContext } from './StatusEditContext';

/** Confluence-style status pill color presets */
export const STATUS_COLORS = [
  { key: 'blue', label: 'Blue', class: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { key: 'green', label: 'Green', class: 'bg-green-500/20 text-green-300 border-green-500/30' },
  { key: 'yellow', label: 'Yellow', class: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  { key: 'red', label: 'Red', class: 'bg-red-500/20 text-red-300 border-red-500/30' },
  { key: 'grey', label: 'Grey', class: 'bg-zinc-700 text-zinc-300 border-zinc-600' },
  { key: 'purple', label: 'Purple', class: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  { key: 'orange', label: 'Orange', class: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
] as const;

const COLOR_MAP = Object.fromEntries(STATUS_COLORS.map((c) => [c.key, c.class]));

function getStatusColorClass(color: string): string {
  return COLOR_MAP[color as keyof typeof COLOR_MAP] ?? STATUS_COLORS[0].class;
}

function generateStatusId(): string {
  return `status-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generateStatusInlineContent(text: string, color: string) {
  return {
    type: 'status' as const,
    props: {
      id: generateStatusId(),
      text,
      color,
    },
  };
}

export const createStatusInlineSpec = () =>
  createReactInlineContentSpec(
    {
      type: 'status',
      propSchema: {
        id: { default: '' },
        text: { default: 'Status' },
        color: {
          default: 'blue',
          values: STATUS_COLORS.map((c) => c.key),
        },
      },
      content: 'none',
    },
    {
      render: (props) => {
        const { id, text: rawText, color } = props.inlineContent.props;
        const text = String(rawText || 'Status').trim() || 'Status';
        const colorVal = String(color || 'blue');
        const colorClass = getStatusColorClass(colorVal);
        const openEdit = useStatusEditContext()?.openStatusEditDialog;
        const statusId = id || `${text}-${colorVal}`;

        const handleClick = (e: React.MouseEvent) => {
          if (openEdit) {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            openEdit(statusId, text, colorVal);
          }
        };

        return (
          <span
            className={`inline-flex px-2 py-1 text-xs rounded border ${colorClass} ${
              openEdit ? 'cursor-pointer hover:ring-2 hover:ring-white/30 hover:ring-offset-1' : ''
            }`}
            data-status-inline
            onClick={openEdit ? handleClick : undefined}
            role={openEdit ? 'button' : undefined}
            style={{ userSelect: 'none', pointerEvents: 'auto' }}
          >
            {text}
          </span>
        );
      },
    }
  );
