import type { Project } from '../../types';

interface ProjectInfoSectionProps {
  project: Project;
}

export function ProjectInfoSection({ project }: ProjectInfoSectionProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Project Information</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">ID</label>
          <div className="text-sm text-zinc-300 font-mono bg-zinc-800 rounded px-3 py-2">{project.id}</div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Project Key</label>
          <div className="text-sm text-zinc-300 font-mono bg-zinc-800 rounded px-3 py-2">
            {project.projectKey || '—'}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Created At</label>
          <div className="text-sm text-zinc-300 bg-zinc-800 rounded px-3 py-2">
            {new Date(project.createdAt).toLocaleString('ja-JP')}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Updated At</label>
          <div className="text-sm text-zinc-300 bg-zinc-800 rounded px-3 py-2">
            {new Date(project.updatedAt).toLocaleString('ja-JP')}
          </div>
        </div>
      </div>
    </div>
  );
}
