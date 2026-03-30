import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

type BoardColumnHeaderTitleProps = {
  title: string;
  onRename: (from: string, to: string) => void | Promise<void>;
};

/**
 * Inline-edit column title: click to edit, Enter or blur to commit, Esc to cancel.
 */
export function BoardColumnHeaderTitle({ title, onRename }: BoardColumnHeaderTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(title);
    }
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === title) {
      return;
    }
    await onRename(title, next);
  };

  const cancel = () => {
    setDraft(title);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="min-w-0 flex-1 rounded bg-zinc-900 border border-violet-500/60 px-1.5 py-0.5 text-sm font-semibold text-white"
        value={draft}
        aria-label="Column name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            cancel();
          }
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          void commit();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="min-w-0 flex-1 truncate text-left font-semibold text-white hover:text-violet-200 transition-colors"
      onClick={() => setEditing(true)}
    >
      {title}
    </button>
  );
}
