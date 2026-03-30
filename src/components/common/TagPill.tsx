import { getTagColorClass } from '../../utils/colorHash';

type TagPillProps = {
  value: string;
  className?: string;
};

export const TagPill = ({ value, className }: TagPillProps) => {
  const colorClass = getTagColorClass(value);
  return (
    <span className={`px-2 py-1 text-xs rounded border ${colorClass} ${className ?? ''}`.trim()}>
      {value}
    </span>
  );
};
