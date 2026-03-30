import type { AiHistoryMessage } from '../../utils/aiHistory';
import type { AiProgressEvent } from './AiProgressDialog';

/** Plain text to copy for a progress / streaming event (matches on-screen content). */
export function getCopyTextForProgressEvent(event: AiProgressEvent): string {
  switch (event.type) {
    case 'user':
      return event.message;
    case 'phase':
      return event.message;
    case 'toolCall':
      return `Tool: ${event.name}`;
    case 'llmOutput':
      return event.text;
    case 'result':
      return event.message || 'Completed.';
    case 'error':
      return event.message;
  }
}

/** Plain text for the whole conversation panel (history + in-flight progress). */
export function formatConversationPanelText(
  history: AiHistoryMessage[],
  progressEvents: AiProgressEvent[],
  options?: { progressRunning?: boolean }
): string {
  const chunks: string[] = [];
  for (const item of history) {
    const label = item.role === 'user' ? 'You' : 'Assistant';
    chunks.push(`${label}\n${item.content}`);
  }
  for (const ev of progressEvents) {
    chunks.push(getCopyTextForProgressEvent(ev));
  }
  if (options?.progressRunning) {
    chunks.push('Processing...');
  }
  return chunks.join('\n\n').trim();
}

/** Plain text for the progress dialog body (all streamed events). */
export function formatProgressDialogClipboardText(
  events: AiProgressEvent[],
  options?: { isRunning?: boolean }
): string {
  const chunks = events.map(getCopyTextForProgressEvent);
  if (options?.isRunning) {
    chunks.push('Running...');
  }
  return chunks.join('\n\n').trim();
}
