import { useEffect, useRef, useState } from 'react';

type BoardInlineCreateCardProps = {
  columnId: string;
  variant?: 'card' | 'row';
  placeholder?: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
};

export const BoardInlineCreateCard = ({
  columnId,
  variant = 'card',
  placeholder = 'What needs to be done?',
  onSubmit,
  onCancel,
}: BoardInlineCreateCardProps) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    submittedRef.current = true;
    onSubmit(trimmed);
  };

  const handleBlur = () => {
    if (submittedRef.current) return;
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const shellClass =
    variant === 'row'
      ? 'bg-zinc-900 border border-violet-500/60 rounded-lg px-4 py-2'
      : 'bg-zinc-900 border border-violet-500/60 rounded-lg p-3';

  return (
    <div
      className={shellClass}
      data-testid={`board-inline-create-${columnId}`}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={variant === 'row' ? 1 : 2}
        className="w-full resize-none bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
        aria-label="New task title"
        data-testid={`board-inline-create-input-${columnId}`}
      />
    </div>
  );
};
