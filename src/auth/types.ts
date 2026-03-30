export type Role = 'admin' | 'editor' | 'viewer';

export type Me = {
  userId: string;
  email: string;
  role: Role;
  lastLoginAt?: number | null;
};

export type Permission = 'read' | 'write' | 'none';

export interface ProjectPolicy {
  projectDefaults: PolicyDefaults;
}

export interface PolicyDefaults {
  groups?: Record<string, Permission>;
  users?: Record<string, Permission>;
  anonymous: Permission;
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

