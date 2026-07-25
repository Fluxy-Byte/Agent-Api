import type { PermissionAction } from "../../domain/enums/permission-action";
import { ForbiddenError } from "../../domain/errors/app-error";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import { PERMISSION_MATRIX } from "./permission-matrix";

export const authorizationService = {
  can(user: AuthUser, action: PermissionAction): boolean {
    if (user.isPlatformAdmin) return true;
    if (!user.activeMemberRole) return false;
    return PERMISSION_MATRIX[user.activeMemberRole].includes(action);
  },

  assert(user: AuthUser, action: PermissionAction): void {
    if (!this.can(user, action)) {
      throw new ForbiddenError();
    }
  },
};
