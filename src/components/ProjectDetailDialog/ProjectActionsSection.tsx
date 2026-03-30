import { Sparkles, Settings, Trash2 } from 'lucide-react';

interface ProjectActionsSectionProps {
  isAdmin: boolean;
  onAICommand?: () => void;
  onOpenPolicy?: () => void;
  onDelete?: () => void;
  deleting: boolean;
}

export function ProjectActionsSection({
  isAdmin,
  onAICommand,
  onOpenPolicy,
  onDelete,
  deleting,
}: ProjectActionsSectionProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Actions</h3>
      <div className="space-y-2">
        {onAICommand && (
          <button
            onClick={() => onAICommand()}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-md text-sm font-medium hover:from-violet-500 hover:to-purple-500 transition-all"
          >
            <Sparkles className="w-5 h-5" />
            <span>AI Transform</span>
          </button>
        )}

        {isAdmin && onOpenPolicy && (
          <button
            onClick={() => onOpenPolicy()}
            className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm text-zinc-200 transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span>Access Policy</span>
          </button>
        )}

        {isAdmin && onDelete && (
          <button
            onClick={onDelete}
            disabled={deleting}
            className="w-full flex items-center gap-3 px-4 py-3 bg-red-900/60 hover:bg-red-800/60 border border-red-700 rounded-md text-sm text-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-5 h-5" />
            {deleting ? 'Deleting...' : 'Delete Project'}
          </button>
        )}
      </div>
    </div>
  );
}
