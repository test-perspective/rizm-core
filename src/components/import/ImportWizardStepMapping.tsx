import { Trash2 } from 'lucide-react';
import type { ImportMetadata, ImportMappingConfig } from '../../api/import';
import { RIZM_TASK_PROPERTIES, suggestRizmProperty } from './importWizardHelpers';

interface ImportWizardStepMappingProps {
  metadata: ImportMetadata;
  mapping: ImportMappingConfig;
  setMapping: React.Dispatch<React.SetStateAction<ImportMappingConfig>>;
}

export function ImportWizardStepMapping({ metadata, mapping, setMapping }: ImportWizardStepMappingProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Field and status mappings. Edit, add, or remove before starting the import.
      </p>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-zinc-300">Field mappings</label>
          <select
            value=""
            onChange={(e) => {
              const fieldId = e.target.value;
              if (!fieldId) return;
              const f = metadata.fields.find((x) => x.id === fieldId);
              if (!f || mapping.fieldMappings.some((m) => m.externalFieldId === fieldId)) return;
              setMapping((prev) => ({
                ...prev,
                fieldMappings: [
                  ...prev.fieldMappings,
                  {
                    externalFieldId: f.id,
                    externalFieldName: f.name,
                    rizmProperty: suggestRizmProperty(f.id, f.name),
                  },
                ],
              }));
              e.target.value = '';
            }}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white"
          >
            <option value="">+ Add field</option>
            {metadata.fields
              .filter((f) => !mapping.fieldMappings.some((m) => m.externalFieldId === f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {mapping.fieldMappings.map((fm, i) => (
            <div key={`${fm.externalFieldId}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="text-zinc-400 flex-1 truncate min-w-0" title={fm.externalFieldName}>
                {fm.externalFieldName}
              </span>
              <span className="text-zinc-500 shrink-0">→</span>
              <select
                value={fm.rizmProperty}
                onChange={(e) => {
                  const next = [...mapping.fieldMappings];
                  next[i] = { ...next[i], rizmProperty: e.target.value };
                  setMapping((prev) => ({ ...prev, fieldMappings: next }));
                }}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-violet-300 w-32 shrink-0"
              >
                {RIZM_TASK_PROPERTIES.map((p) => (
                  <option key={p || '__none__'} value={p}>
                    {p || '(no mapping)'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setMapping((prev) => ({
                    ...prev,
                    fieldMappings: prev.fieldMappings.filter((_, j) => j !== i),
                  }));
                }}
                className="p-1 text-zinc-500 hover:text-red-400 shrink-0"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Backlog mapping</label>
        <p className="text-xs text-zinc-500 mb-2">
          In Jira Scrum, backlog = issues not in any sprint. Map them to a status:
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            id="mapBacklog"
            checked={!!mapping.mapBacklogToStatus}
            onChange={(e) => {
              setMapping((prev) => ({
                ...prev,
                mapBacklogToStatus: e.target.checked ? 'Backlog' : undefined,
              }));
            }}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          <label htmlFor="mapBacklog" className="text-sm text-zinc-300">
            Map backlog (sprint empty) to status
          </label>
          {mapping.mapBacklogToStatus && (
            <input
              type="text"
              value={mapping.mapBacklogToStatus}
              onChange={(e) =>
                setMapping((prev) => ({
                  ...prev,
                  mapBacklogToStatus: e.target.value.trim() || undefined,
                }))
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-violet-300 w-24 text-sm"
              placeholder="Backlog"
            />
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Status mappings</label>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {mapping.statusMappings.map((sm, i) => (
            <div key={`${sm.externalStatusId}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="text-zinc-400 flex-1 truncate min-w-0">{sm.externalStatusName}</span>
              <span className="text-zinc-500 shrink-0">→</span>
              <input
                type="text"
                value={sm.rizmStatus}
                onChange={(e) => {
                  const next = [...mapping.statusMappings];
                  next[i] = { ...next[i], rizmStatus: e.target.value };
                  setMapping((prev) => ({ ...prev, statusMappings: next }));
                }}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-violet-300 w-28 shrink-0"
              />
              <button
                type="button"
                onClick={() => {
                  setMapping((prev) => ({
                    ...prev,
                    statusMappings: prev.statusMappings.filter((_, j) => j !== i),
                  }));
                }}
                className="p-1 text-zinc-500 hover:text-red-400 shrink-0"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
