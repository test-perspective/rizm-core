/**
 * Check if a title value is blank (empty or whitespace only)
 */
export function isBlankTitle(title: unknown): boolean {
  if (typeof title !== 'string') return true;
  return title.trim().length === 0;
}

/**
 * Check if a task should be discarded (title is blank)
 * This is used to determine if we should show discard confirmation instead of regular delete
 */
export function shouldDiscardTask(title: unknown): boolean {
  return isBlankTitle(title);
}
