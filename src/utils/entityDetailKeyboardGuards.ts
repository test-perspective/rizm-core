/**
 * Returns true when ArrowLeft/ArrowRight should not trigger adjacent-entity navigation
 * in the entity detail panel (e.g. user is typing or a modal has focus).
 */
export function shouldSuppressAdjacentEntityNavigation(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;

  const active = document.activeElement;
  if (!active || !(active instanceof HTMLElement)) return false;

  if (active.closest('[role="dialog"]')) return true;

  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

  if (active.isContentEditable) return true;
  if (active.closest('[contenteditable="true"]')) return true;

  return false;
}
