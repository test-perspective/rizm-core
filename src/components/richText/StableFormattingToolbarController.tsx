import {
  FormattingToolbar,
  type FormattingToolbarProps,
  PositionPopover,
  useBlockNoteEditor,
  useEditorSelectionBoundingBox,
  useEditorState,
  useExtension,
  useExtensionState,
  type FloatingUIOptions,
} from '@blocknote/react';
import { blockHasType, defaultProps, type BlockSchema, type DefaultProps, type InlineContentSchema, type StyleSchema } from '@blocknote/core';
import { FormattingToolbarExtension } from '@blocknote/core/extensions';
import { flip, offset, shift } from '@floating-ui/react';
import { type FC, useMemo } from 'react';

const textAlignmentToPlacement = (textAlignment: DefaultProps['textAlignment']) => {
  switch (textAlignment) {
    case 'left':
      return 'top-start';
    case 'center':
      return 'top';
    case 'right':
      return 'top-end';
    default:
      return 'top-start';
  }
};

function hasInvalidSelectionRect(rect: DOMRect | undefined): boolean {
  if (!rect) return true;
  if (rect.width <= 0 || rect.height <= 0) return true;
  // A stale selection can transiently resolve to viewport origin (0,0).
  if (Math.round(rect.left) === 0 && Math.round(rect.top) === 0) return true;
  return false;
}

export function StableFormattingToolbarController(props: {
  formattingToolbar?: FC<FormattingToolbarProps>;
  floatingUIOptions?: FloatingUIOptions;
}) {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const formattingToolbar = useExtension(FormattingToolbarExtension, { editor });
  const show = useExtensionState(FormattingToolbarExtension, { editor });

  const selectionRect = useEditorSelectionBoundingBox(!!show, editor);
  const hasFocus = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isFocused,
  });
  const hasRangeSelection = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { from, to } = current.prosemirrorState.selection;
      return from !== to;
    },
  });

  const position = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      formattingToolbar.store.state
        ? {
            from: current.prosemirrorState.selection.from,
            to: current.prosemirrorState.selection.to,
          }
        : undefined,
  });

  const placement = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const block = current.getTextCursorPosition().block;

      if (
        !blockHasType(block, current, block.type, {
          textAlignment: defaultProps.textAlignment,
        })
      ) {
        return 'top-start';
      }
      return textAlignmentToPlacement(block.props.textAlignment);
    },
  });

  const isEditorMounted = !!editor.domElement && editor.domElement.isConnected && !!editor.prosemirrorView;
  const stableOpen =
    !!show &&
    isEditorMounted &&
    !!hasFocus &&
    !!hasRangeSelection &&
    !hasInvalidSelectionRect(selectionRect);

  const floatingUIOptions = useMemo<FloatingUIOptions>(
    () => ({
      useFloatingOptions: {
        open: stableOpen,
        onOpenChange: (open, _event, reason) => {
          formattingToolbar.store.setState(open);
          if (reason === 'escape-key') {
            editor.focus();
          }
        },
        placement,
        middleware: [offset(10), shift(), flip()],
      },
      elementProps: {
        style: {
          zIndex: 40,
        },
      },
      // REQ-223: Prevent toolbar from stealing focus when selecting with keyboard or pressing Delete.
      // initialFocus: -1 = do not move focus to toolbar on open; modal: false = focus stays in editor.
      focusManagerProps: {
        initialFocus: -1,
        modal: false,
      },
      ...props.floatingUIOptions,
    }),
    [stableOpen, placement, props.floatingUIOptions, formattingToolbar.store, editor]
  );

  const Component = props.formattingToolbar || FormattingToolbar;

  return (
    <PositionPopover position={position} {...floatingUIOptions}>
      {stableOpen && <Component />}
    </PositionPopover>
  );
}
