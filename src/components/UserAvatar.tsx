import { getAvatarInitial, getAvatarColorClasses } from '../utils/avatar';

interface UserAvatarProps {
  email: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

export function UserAvatar({ email, size = 'md', className = '' }: UserAvatarProps) {
  const initial = getAvatarInitial(email);
  const colorClasses = getAvatarColorClasses(email);
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border font-bold ${sizeClasses} ${colorClasses} ${className}`}
      title={email}
    >
      {initial}
    </div>
  );
}
