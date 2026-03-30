import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import { writeTextToClipboard } from '../../utils/clipboard';

const COPIED_RESET_MS = 2000;

type CopyTextButtonProps = {
  text: string;
  /** Accessible name; keep English per product convention */
  'aria-label'?: string;
  /** Tooltip when not yet copied */
  title?: string;
  className?: string;
  disabled?: boolean;
};

export function CopyTextButton({
  text,
  'aria-label': ariaLabel = 'Copy message',
  title: titleProp,
  className = '',
  disabled = false,
}: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      if (!text.trim() || disabled) return;
      const ok = await writeTextToClipboard(text);
      if (!ok) return;
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => {
        setCopied(false);
        resetRef.current = null;
      }, COPIED_RESET_MS);
    },
    [text, disabled]
  );

  const isDisabled = disabled || !text.trim();

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={copied ? 'Copied' : ariaLabel}
      title={copied ? 'Copied' : titleProp ?? 'Copy'}
      className={`inline-flex shrink-0 items-center justify-center rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-30 ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}
