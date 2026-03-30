export type WikiPagePatch = { doc?: string; title?: string };
export type WikiUnsavedUpdate = { pageId: string; patch: WikiPagePatch };

export const computeWikiUnsavedUpdateForPage = (
  pageId: string,
  docById: Record<string, string | undefined>,
  lastSavedDocById: Record<string, string | undefined>,
  titleById: Record<string, string>,
  lastSavedTitleById: Record<string, string | undefined>,
  includeDoc: boolean = true
): WikiUnsavedUpdate | null => {
  const currentDoc = docById[pageId];
  const lastSavedDoc = lastSavedDocById[pageId];
  const currentTitle = titleById[pageId];
  const lastSavedTitle = lastSavedTitleById[pageId];

  const hasDocChanges = includeDoc && currentDoc !== undefined && currentDoc !== lastSavedDoc;
  const hasTitleChanges = currentTitle !== undefined && currentTitle !== lastSavedTitle;

  if (!hasDocChanges && !hasTitleChanges) return null;

  const patch: WikiPagePatch = {};
  if (hasDocChanges) patch.doc = currentDoc;
  if (hasTitleChanges) patch.title = currentTitle;
  return { pageId, patch };
};

export const computeWikiUnsavedUpdates = (
  pageIds: string[],
  docById: Record<string, string | undefined>,
  lastSavedDocById: Record<string, string | undefined>,
  titleById: Record<string, string>,
  lastSavedTitleById: Record<string, string | undefined>,
  includeDoc: boolean = true
): WikiUnsavedUpdate[] => {
  const updates: WikiUnsavedUpdate[] = [];
  for (const pageId of pageIds) {
    const update = computeWikiUnsavedUpdateForPage(
      pageId,
      docById,
      lastSavedDocById,
      titleById,
      lastSavedTitleById,
      includeDoc
    );
    if (update) updates.push(update);
  }
  return updates;
};

export const hasAnyWikiUnsavedChanges = (
  pageIds: string[],
  docById: Record<string, string | undefined>,
  lastSavedDocById: Record<string, string | undefined>,
  titleById: Record<string, string>,
  lastSavedTitleById: Record<string, string | undefined>,
  includeDoc: boolean = true
): boolean => {
  return (
    computeWikiUnsavedUpdates(
      pageIds,
      docById,
      lastSavedDocById,
      titleById,
      lastSavedTitleById,
      includeDoc
    )
      .length > 0
  );
};
