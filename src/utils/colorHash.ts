const COLOR_CLASSES = [
  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'bg-green-500/20 text-green-300 border-green-500/30',
  'bg-lime-500/20 text-lime-300 border-lime-500/30',
  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'bg-red-500/20 text-red-300 border-red-500/30',
  'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  'bg-purple-500/20 text-purple-300 border-purple-500/30',
];

const normalizeLabel = (label: string): string => label.trim().toLowerCase();

const hashStringToIndex = (value: string, modulo: number): number => {
  if (modulo <= 0) return 0;
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash) % modulo;
};

export const getTagColorClass = (label: string): string => {
  const normalized = normalizeLabel(label);
  const index = hashStringToIndex(normalized, COLOR_CLASSES.length);
  return COLOR_CLASSES[index] ?? COLOR_CLASSES[0];
};
