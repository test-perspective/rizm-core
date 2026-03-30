import { getTagColorClass } from '../../../utils/colorHash';

export const SelectPill = ({ value }: { value: string }) => {
  const colors: Record<string, string> = {
    Done: 'bg-green-500/20 text-green-300 border-green-500/30',
    'In Progress': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    Todo: 'bg-zinc-700 text-zinc-300 border-zinc-600',
    High: 'bg-red-500/20 text-red-300 border-red-500/30',
    Medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    Low: 'bg-zinc-700 text-zinc-300 border-zinc-600',
  };
  const colorClass = colors[value] || getTagColorClass(value);
  return <span className={`px-2 py-1 text-xs rounded border ${colorClass}`}>{value}</span>;
};
