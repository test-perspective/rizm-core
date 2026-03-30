import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { PropertyDefinition } from '../../../types';
import { PropertyInput } from './PropertyInput';

let lastRichTextEditorProps: Record<string, unknown> | null = null;

vi.mock('../../RichTextEditor', () => ({
  RichTextEditor: (props: Record<string, unknown>) => {
    lastRichTextEditorProps = props;
    return null;
  },
}));

const richtextProp: PropertyDefinition = { name: 'description', type: 'richtext', visible: true };

describe('PropertyInput richtext attachment context (REQ-251)', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    lastRichTextEditorProps = null;
  });

  it('forwards richtextAttachmentContext to RichTextEditor when set', async () => {
    const ctx = {
      projectId: 'p1',
      entityPk: 'e1',
      values: { attachments: [] as unknown[] },
      onServerEntity: vi.fn(),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PropertyInput
          entityId="e1"
          entityTypeId="task"
          prop={richtextProp}
          value="[]"
          isValuesReady
          entities={[]}
          usersById={{}}
          onChange={() => {}}
          richtextAttachmentContext={ctx}
        />
      );
    });
    expect(lastRichTextEditorProps?.attachmentContext).toEqual(ctx);
    act(() => root.unmount());
    container.remove();
  });

  it('passes undefined attachmentContext when richtextAttachmentContext is omitted', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <PropertyInput
          entityId="e1"
          entityTypeId="task"
          prop={richtextProp}
          value="[]"
          isValuesReady
          entities={[]}
          usersById={{}}
          onChange={() => {}}
        />
      );
    });
    expect(lastRichTextEditorProps?.attachmentContext).toBeUndefined();
    act(() => root.unmount());
    container.remove();
  });
});
