import type { MemberRole } from "../../../domain/enums/member-role";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /// User.role === "admin" do plugin admin do Better Auth — acesso global,
  /// ignora a matriz de permissões por organização.
  isPlatformAdmin: boolean;
  activeOrganizationId: string | null;
  /// Papel do usuário na organização ativa (null se ele não é Member dela, ou
  /// se nenhuma organização está ativa na sessão).
  activeMemberRole: MemberRole | null;
}
