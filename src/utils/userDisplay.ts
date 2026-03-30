/**
 * Get display name from email (local part before @)
 */
export function getUserDisplayName(email: string): string {
  if (!email) return '';
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;
  return email.slice(0, atIndex);
}

export const DELETED_USER_LABEL = 'deleted user';
