export type AiHistoryTab = 'transform' | 'assistant';
export type AiHistoryRole = 'user' | 'assistant';

export type AiHistoryMessage = {
  role: AiHistoryRole;
  content: string;
  createdAt: number;
};

const STORAGE_PREFIX = 'keel_ai_history:';
const MAX_HISTORY_MESSAGES = 20;
const ME_PAGE_STORAGE_KEY = 'me';

const normalizeProjectIdForStorage = (projectId: string): string =>
  projectId.trim() || ME_PAGE_STORAGE_KEY;

const makeStorageKey = (projectId: string, tab: AiHistoryTab): string =>
  `${STORAGE_PREFIX}${normalizeProjectIdForStorage(projectId)}:${tab}`;

const normalizeMessage = (value: unknown): AiHistoryMessage | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as { role?: unknown; content?: unknown; createdAt?: unknown };
  const role = candidate.role === 'user' || candidate.role === 'assistant' ? candidate.role : null;
  const content = typeof candidate.content === 'string' ? candidate.content.trim() : '';
  const createdAt =
    typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now();
  if (!role || !content) return null;
  return { role, content, createdAt };
};

export const getAiHistory = (projectId: string, tab: AiHistoryTab): AiHistoryMessage[] => {
  try {
    const raw = localStorage.getItem(makeStorageKey(projectId, tab));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeMessage).filter((item): item is AiHistoryMessage => item !== null).slice(-MAX_HISTORY_MESSAGES);
  } catch {
    return [];
  }
};

export const setAiHistory = (projectId: string, tab: AiHistoryTab, messages: AiHistoryMessage[]): void => {
  const normalized = messages
    .map(normalizeMessage)
    .filter((item): item is AiHistoryMessage => item !== null)
    .slice(-MAX_HISTORY_MESSAGES);
  try {
    localStorage.setItem(makeStorageKey(projectId, tab), JSON.stringify(normalized));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

export const appendAiHistoryPair = (
  projectId: string,
  tab: AiHistoryTab,
  userContent: string,
  assistantContent: string
): AiHistoryMessage[] => {
  const base = getAiHistory(projectId, tab);
  const now = Date.now();
  const next: AiHistoryMessage[] = [...base];
  const userText = userContent.trim();
  const assistantText = assistantContent.trim();
  if (userText) next.push({ role: 'user', content: userText, createdAt: now });
  if (assistantText) next.push({ role: 'assistant', content: assistantText, createdAt: now + 1 });
  setAiHistory(projectId, tab, next);
  return getAiHistory(projectId, tab);
};

export const clearAiHistory = (projectId: string, tab: AiHistoryTab): void => {
  try {
    localStorage.removeItem(makeStorageKey(projectId, tab));
  } catch {
    // ignore
  }
};
