/**
 * Shared dialog type definitions.
 */

/** Alert dialog options */
export interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
}

/** Confirm dialog options */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** When true (destructive actions), styles the confirm button as danger */
  danger?: boolean;
}

/** Prompt dialog options */
export interface PromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  /** e.g. 'text' | 'password' */
  inputType?: string;
  confirmText?: string;
  cancelText?: string;
  /**
   * Validate input. Return an error message to disable submit and show the error;
   * return null/undefined when valid.
   */
  validate?: (value: string) => string | null | undefined;
  /** Read-only (e.g. copy-only flows) */
  readOnly?: boolean;
}

/** Dialog kind */
export type DialogType = 'alert' | 'confirm' | 'prompt';

/** Queued dialog request */
export interface DialogRequest {
  id: string;
  type: DialogType;
  options: AlertOptions | ConfirmOptions | PromptOptions;
  resolve: (value: unknown) => void;
}

/** API returned by useAppDialog */
export interface AppDialogAPI {
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}
