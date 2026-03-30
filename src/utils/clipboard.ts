/**
 * Writes plain text to the system clipboard. Fails quietly in non-secure contexts or denied permission.
 */
export async function writeTextToClipboard(text: string): Promise<boolean> {
  if (!text || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn('[clipboard] writeText failed', e);
    return false;
  }
}
