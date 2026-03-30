import { createContext, useContext } from 'react';

export type StatusEditContextValue = {
  openStatusEditDialog: (statusId: string, text: string, color: string) => void;
} | null;

export const StatusEditContext = createContext<StatusEditContextValue>(null);

export function useStatusEditContext(): StatusEditContextValue {
  return useContext(StatusEditContext);
}
