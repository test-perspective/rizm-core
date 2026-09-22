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

/**
 * Fork of BlockNote's FormattingToolbarController that only opens the toolbar when the
 * editor is focused, the selection is a real range, and its bounding box is usable.
 * Upstream still has none of those guards as of 0.54, so this cannot be replaced by
 * the built-in controller yet. Everything else mirrors upstream and should be
 * re-synced against it on each BlockNote upgrade.
 */
export function StableFormattingToolbarController(props: {
  formattingToolbar?: FC<FormattingToolbarProps>;
  floatingUIOptions?: FloatingUIOptions;
  /** Overrides the DOM node the popover portals into; defaults to editor.portalElement. */
  portalElement?: HTMLElement | null;
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
      ...props.floatingUIOptions,
      useFloatingOptions: {
        open: stableOpen,
        // Needed as hooks like `useDismiss` call `onOpenChange` to change the open state.
        onOpenChange: (open, _event, reason) => {
          formattingToolbar.store.setState(open);
          if (reason === 'escape-key') {
            editor.focus();
          }
        },
        placement,
        middleware: [offset(10), shift(), flip()],
        ...props.floatingUIOptions?.useFloatingOptions,
      },
      // REQ-223: Prevent the toolbar from stealing focus when selecting with the keyboard
      // or pressing Delete. BlockNote 0.54 disables the focus manager outright for the
      // same reason, which subsumes the initialFocus/modal pair used before.
      focusManagerProps: {
        disabled: true,
        ...props.floatingUIOptions?.focusManagerProps,
      },
      elementProps: {
        style: {
          zIndex: 40,
        },
        ...props.floatingUIOptions?.elementProps,
      },
    }),
    [stableOpen, placement, props.floatingUIOptions, formattingToolbar.store, editor]
  );

  const Component = props.formattingToolbar || FormattingToolbar;

  return (
    <PositionPopover
      position={position}
      portalElement={props.portalElement}
      {...floatingUIOptions}
    >
      {stableOpen && <Component />}
    </PositionPopover>
  );
}
