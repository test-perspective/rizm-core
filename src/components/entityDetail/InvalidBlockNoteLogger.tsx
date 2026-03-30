/**
 * Debug component: logs invalid BlockNote data to console when fallback is shown.
 * Helps investigate import issues (e.g. Jira ADF stored as-is, malformed comments).
 */
import { useEffect, useRef } from 'react';

type InvalidBlockNoteLoggerProps =
  | { source: 'comment'; id: string; raw: unknown }
  | { source: 'property'; propName: string; raw: unknown };

export function InvalidBlockNoteLogger(props: InvalidBlockNoteLoggerProps) {
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;

    const { source, raw } = props;
    const label = source === 'comment' ? `comment ${props.id}` : `property ${props.propName}`;

    let preview: string;
    if (typeof raw === 'string') {
      preview = raw.length > 500 ? raw.slice(0, 500) + '...' : raw;
    } else {
      preview = JSON.stringify(raw);
      if (preview.length > 500) preview = preview.slice(0, 500) + '...';
    }

    console.warn(
      `[InvalidBlockNote] ${label} has unsupported format. ` +
        'Expected: BlockNote JSON (array of blocks with type). ' +
        'Raw preview:',
      preview
    );
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        console.warn('[InvalidBlockNote] Parsed as object (not array). Keys:', Object.keys(parsed));
      } catch {
        // ignore
      }
    }
  }, [props]);

  return null;
}
