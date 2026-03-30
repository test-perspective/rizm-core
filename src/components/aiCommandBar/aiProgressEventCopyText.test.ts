import { describe, expect, it } from 'vitest';
import {
  formatConversationPanelText,
  formatProgressDialogClipboardText,
  getCopyTextForProgressEvent,
} from './aiProgressEventCopyText';

describe('getCopyTextForProgressEvent', () => {
  it('maps each event type to the displayed copy string', () => {
    expect(getCopyTextForProgressEvent({ type: 'user', message: 'u' })).toBe('u');
    expect(getCopyTextForProgressEvent({ type: 'phase', message: 'p' })).toBe('p');
    expect(getCopyTextForProgressEvent({ type: 'toolCall', name: 'foo' })).toBe('Tool: foo');
    expect(getCopyTextForProgressEvent({ type: 'llmOutput', text: 't' })).toBe('t');
    expect(getCopyTextForProgressEvent({ type: 'result', message: 'r' })).toBe('r');
    expect(getCopyTextForProgressEvent({ type: 'result' })).toBe('Completed.');
    expect(getCopyTextForProgressEvent({ type: 'error', message: 'e' })).toBe('e');
  });
});

describe('formatConversationPanelText', () => {
  it('joins history and progress with blank lines and optional processing note', () => {
    expect(
      formatConversationPanelText(
        [
          { role: 'user', content: 'Hi', createdAt: 1 },
          { role: 'assistant', content: 'Hey', createdAt: 2 },
        ],
        [{ type: 'phase', message: 'Working' }],
        { progressRunning: true }
      )
    ).toBe('You\nHi\n\nAssistant\nHey\n\nWorking\n\nProcessing...');
  });
});

describe('formatProgressDialogClipboardText', () => {
  it('joins events and optional running note', () => {
    expect(
      formatProgressDialogClipboardText(
        [
          { type: 'user', message: 'a' },
          { type: 'llmOutput', text: 'b' },
        ],
        { isRunning: true }
      )
    ).toBe('a\n\nb\n\nRunning...');
  });
});
