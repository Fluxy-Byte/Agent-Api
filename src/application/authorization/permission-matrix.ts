import { MemberRole } from "../../domain/enums/member-role";
import { PermissionAction } from "../../domain/enums/permission-action";

/// Mapeamento direto das descrições de papel do EscopoSaas:
/// - Atendente: só visualiza contatos, sem edição, sem acesso a empresas.
/// - Supervisor: gerenciamento de atendentes (filas), contatos, campanhas.
/// - Gerente: todas as funcionalidades das empresas que ele acessa.
/// - Administrador (fora desta matriz, ver AuthorizationService): bypass total
///   + acesso cross-empresa.
export const PERMISSION_MATRIX: Record<MemberRole, PermissionAction[]> = {
  ATENDENTE: [PermissionAction.CONTACTS_VIEW],
  SUPERVISOR: [
    PermissionAction.CONTACTS_VIEW,
    PermissionAction.CONTACTS_WRITE,
    PermissionAction.QUEUES_VIEW,
    PermissionAction.QUEUES_WRITE,
    PermissionAction.CAMPAIGNS_VIEW,
    PermissionAction.CAMPAIGNS_WRITE,
  ],
  GERENTE: [
    PermissionAction.AGENTS_VIEW,
    PermissionAction.AGENTS_WRITE,
    PermissionAction.WABAS_VIEW,
    PermissionAction.WABAS_WRITE,
    PermissionAction.SERVICE_ISLANDS_VIEW,
    PermissionAction.SERVICE_ISLANDS_WRITE,
    PermissionAction.QUEUES_VIEW,
    PermissionAction.QUEUES_WRITE,
    PermissionAction.CONTACTS_VIEW,
    PermissionAction.CONTACTS_WRITE,
    PermissionAction.CAMPAIGNS_VIEW,
    PermissionAction.CAMPAIGNS_WRITE,
    PermissionAction.ACCESS_VIEW,
    PermissionAction.ACCESS_WRITE,
    PermissionAction.COMPANIES_MANAGE_OWN,
  ],
};
