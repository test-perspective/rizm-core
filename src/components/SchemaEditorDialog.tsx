import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { PropertyDefinition } from '../types';
import { useAppDialog } from './dialogs';
import { SortablePropertyRow } from './SchemaEditorDialog/SortablePropertyRow';

interface SchemaEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityTypeId: string;
  viewId: string;
  properties: PropertyDefinition[];
  onAddPropertyDefinition: (prop: PropertyDefinition) => void;
  onRemovePropertyDefinition: (propName: string) => void;
  onReorderProperties?: (orderedPropNames: string[]) => void;
}

export function SchemaEditorDialog({
  isOpen,
  onClose,
  entityTypeId,
  viewId,
  properties,
  onAddPropertyDefinition,
  onRemovePropertyDefinition,
  onReorderProperties,
}: SchemaEditorDialogProps) {
  const dialog = useAppDialog();
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<PropertyDefinition['type']>('text');
  const [newPropVisible, setNewPropVisible] = useState(true);
  const [newPropOptions, setNewPropOptions] = useState(''); // comma-separated
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNewPropName('');
    setNewPropType('text');
    setNewPropVisible(true);
    setNewPropOptions('');
    // Focus after mount
    setTimeout(() => nameRef.current?.focus(), 0);
  }, [isOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const editableProperties = useMemo(() => properties.filter((p) => p.name !== 'taskKey'), [properties]);
  const propIds = useMemo(() => editableProperties.map((p) => p.name), [editableProperties]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderProperties) return;
    const oldIndex = propIds.indexOf(String(active.id));
    const newIndex = propIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(editableProperties, oldIndex, newIndex);
    const orderedNames = reordered.map((p) => p.name);
    const fullOrder = properties.some((p) => p.name === 'taskKey')
      ? ['taskKey', ...orderedNames]
      : orderedNames;
    onReorderProperties(fullOrder);
  };

  const canReorder = !!onReorderProperties && editableProperties.length > 1;

  if (!isOpen) return null;

  const submitNewProperty = async () => {
    const name = newPropName.trim();
    if (!name) return;
    if (properties.some((p) => p.name === name)) {
      await dialog.alert({ message: `'${name}' already exists.` });
      return;
    }

    if (newPropType === 'select' || newPropType === 'labels') {
      const opts = newPropOptions
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (newPropType === 'select' && opts.length === 0) {
        await dialog.alert({ message: 'Please enter at least one option for select type (comma-separated).' });
        return;
      }
      if (newPropType === 'labels') {
        onAddPropertyDefinition({
          name,
          type: 'labels',
          options: opts.length > 0 ? opts : undefined,
          visible: newPropVisible,
        });
      } else {
        onAddPropertyDefinition({ name, type: 'select', options: opts, visible: newPropVisible });
      }
    } else {
      onAddPropertyDefinition({ name, type: newPropType, visible: newPropVisible });
    }

    setNewPropName('');
    setNewPropType('text');
    setNewPropVisible(true);
    setNewPropOptions('');
    nameRef.current?.focus();
  };

  const deletePropertyDefinition = async (propName: string) => {
    const confirmText = await dialog.prompt({
      title: 'Delete Field',
      message: `Delete field '${propName}'.\n\nTo confirm, please type the field name exactly:`,
      placeholder: propName,
      confirmText: 'Delete',
      validate: (value) => (value === propName ? null : 'Field name does not match'),
    });
    if (confirmText === null) return;
    onRemovePropertyDefinition(propName);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-white">Edit Fields (Schema)</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Target: entityId=<span className="font-mono text-zinc-300">{entityTypeId}</span> / viewId=
              <span className="font-mono text-zinc-300"> {viewId}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition-colors" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          <div className="text-sm text-amber-200 bg-amber-950/40 border border-amber-900 rounded-md p-3">
            Deleting fields is dangerous. The corresponding key will be removed from existing data (Entity.properties), and view settings will be automatically adjusted.
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-sm font-semibold text-white mb-3">Add Field</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="block text-xs text-zinc-500 mb-1">name</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  placeholder="e.g. owner"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs text-zinc-500 mb-1">type</label>
                <select
                  value={newPropType}
                  onChange={(e) => setNewPropType(e.target.value as PropertyDefinition['type'])}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="text">text</option>
                  <option value="richtext">richtext</option>
                  <option value="select">select</option>
                  <option value="labels">labels</option>
                  <option value="number">number</option>
                  <option value="date">date</option>
                  <option value="boolean">boolean</option>
                  <option value="link">link</option>
                  <option value="user">user</option>
                </select>
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs text-zinc-500 mb-1">visible</label>
                <label className="flex items-center gap-2 cursor-pointer bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2">
                  <input
                    type="checkbox"
                    checked={newPropVisible}
                    onChange={(e) => setNewPropVisible(e.target.checked)}
                    className="w-4 h-4 bg-zinc-950 border-zinc-800 rounded"
                  />
                  <span className="text-sm text-zinc-300">visible</span>
                </label>
              </div>
            </div>

            {(newPropType === 'select' || newPropType === 'labels') && (
              <div className="mt-3">
                <label className="block text-xs text-zinc-500 mb-1">
                  options (comma-separated)
                  {newPropType === 'labels' ? ' - optional' : ''}
                </label>
                <input
                  type="text"
                  value={newPropOptions}
                  onChange={(e) => setNewPropOptions(e.target.value)}
                  placeholder={newPropType === 'labels' ? 'e.g. bug,urgent' : 'e.g. Todo,In Progress,Done'}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={submitNewProperty}
                disabled={!newPropName.trim()}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="text-sm font-semibold text-white">Existing Fields</div>
              {canReorder && (
                <div className="text-xs text-zinc-500 mt-1">Drag to reorder display order.</div>
              )}
            </div>
            <div className="divide-y divide-zinc-800">
              {editableProperties.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={propIds} strategy={verticalListSortingStrategy}>
                    {editableProperties.map((p) => (
                      <SortablePropertyRow
                        key={p.name}
                        prop={p}
                        onDelete={deletePropertyDefinition}
                        canReorder={canReorder}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="px-4 py-6 text-sm text-zinc-400">No fields defined.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

