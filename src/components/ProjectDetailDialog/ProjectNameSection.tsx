import { Save } from 'lucide-react';

interface ProjectNameSectionProps {
  projectName: string;
  saving: boolean;
  projectNameTrimmed: string;
  lastSavedName: string;
  onProjectNameChange: (value: string) => void;
  onSave: () => void;
}

export function ProjectNameSection({
  projectName,
  saving,
  projectNameTrimmed,
  lastSavedName,
  onProjectNameChange,
  onSave,
}: ProjectNameSectionProps) {
  const canSave = projectNameTrimmed && projectNameTrimmed !== lastSavedName;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Project Name</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !saving) {
              onSave();
            }
          }}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          placeholder="Project name"
          disabled={saving}
        />
        <button
          onClick={onSave}
          disabled={saving || !canSave}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
