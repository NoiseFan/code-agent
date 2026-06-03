import type { PermissionMode } from '../persistence/permission'

export type PermissionModeType = typeof PermissionMode[keyof PermissionMode]
