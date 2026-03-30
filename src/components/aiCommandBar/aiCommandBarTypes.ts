import type { PutManifestOptions } from '../../api/manifest';
import type { ProjectManifest } from '../../types';

export interface AICommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  onTransform: (manifest: ProjectManifest, options?: PutManifestOptions) => void;
  projectId: string;
  onReload: () => Promise<void> | void;
  currentManifest: ProjectManifest;
}
