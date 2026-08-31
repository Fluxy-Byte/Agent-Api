import { Router } from "express";
import { z } from "zod";
import { companyService } from "../../../application/company/company-service";
import { ForbiddenError, ValidationError } from "../../../domain/errors/app-error";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

const createCompanySchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().min(1),
});

const updateMemberRoleSchema = z.object({ role: z.string().min(1) });
const generateInviteCodeSchema = z.object({ role: z.string().min(1), email: z.string().email() });
const redeemInviteCodeSchema = z.object({ code: z.string().min(1) });

export const companiesRouter = Router();

/// Nunca deixa o token de acesso à API externa sair em claro pela API
/// (resposta HTTP ou AuditLog) — o front só precisa saber se já existe um
/// token configurado ou não.
function sanitizeCompany<T extends { tokenAcessApi?: string | null }>(
  company: T,
): Omit<T, "tokenAcessApi"> & { hasApiAccessToken: boolean } {
  const { tokenAcessApi, ...rest } = company;
  return { ...rest, hasApiAccessToken: Boolean(tokenAcessApi) };
}

companiesRouter.get(
  "/",
  apiHandler({ requireCompany: false }, async (_req, _res, user) => {
    const companies = await companyService.listForUser(user);
    return companies.map(sanitizeCompany);
  }),
);

companiesRouter.post(
  "/",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const company = await companyService.create(user, parsed.data);
    const safeCompany = sanitizeCompany(company);
    await recordAudit(req, user, {
      action: "COMPANY_CREATED",
      resourceType: "Company",
      resourceId: company.id,
      afterState: safeCompany,
    });

    return safeCompany;
  }),
);

companiesRouter.get(
  "/:id",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const company = await companyService.getById(user, String(req.params.id));
    return sanitizeCompany(company);
  }),
);

companiesRouter.get(
  "/:id/members",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    return companyService.listMembers(user, String(req.params.id));
  }),
);

/// Checagem de permissão manual (não via apiHandler `action`) porque o papel
/// relevante aqui é o do usuário NA EMPRESA-ALVO (:id da URL), que pode não ser
/// a empresa atualmente ativa na sessão — Gerente gerencia acessos de todas as
/// empresas que participa, não só a que está com o seletor ligado no momento.
companiesRouter.put(
  "/:id/members/:memberId",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const organizationId = String(req.params.id);

    if (!user.isPlatformAdmin) {
      const requesterMembership = await companyService
        .listMembers(user, organizationId)
        .then((members) => members.find((m) => m.userId === user.id));
      if (requesterMembership?.role !== "GERENTE") {
        throw new ForbiddenError("Apenas Gerente ou Administrador podem alterar o tipo de acesso.");
      }
    }

    const memberId = String(req.params.memberId);
    const before = await companyService
      .listMembers(user, organizationId)
      .then((members) => members.find((m) => m.id === memberId));

    const updated = await companyService.updateMemberRole(user, organizationId, memberId, parsed.data.role);

    await recordAudit(req, user, {
      action: "MEMBER_ROLE_UPDATED",
      resourceType: "Member",
      resourceId: memberId,
      beforeState: before,
      afterState: updated,
    });

    return updated;
  }),
);

/// Gera (ou rotaciona) o token de acesso à API externa (Fluxy Agents) — mesma
/// checagem manual de papel (GERENTE/admin) da rota de troca de acesso acima,
/// já que é uma ação sensível de segurança, não só de escrita comum.
companiesRouter.post(
  "/:id/api-token",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const organizationId = String(req.params.id);

    if (!user.isPlatformAdmin) {
      const requesterMembership = await companyService
        .listMembers(user, organizationId)
        .then((members) => members.find((m) => m.userId === user.id));
      if (requesterMembership?.role !== "GERENTE") {
        throw new ForbiddenError("Apenas Gerente ou Administrador podem gerar o token de acesso à API.");
      }
    }

    const { token } = await companyService.generateApiToken(user, organizationId);

    await recordAudit(req, user, {
      action: "API_TOKEN_GENERATED",
      resourceType: "Company",
      resourceId: organizationId,
      afterState: { hasApiAccessToken: true },
    });

    return { token };
  }),
);

/// Checagem manual de papel (GERENTE/admin) igual às outras rotas sensíveis
/// desta empresa-alvo — a listagem expõe os `code` ainda ativos, então não
/// pode ficar aberta pra qualquer membro (só esconder na UI não bastaria).
companiesRouter.get(
  "/:id/invite-codes",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const organizationId = String(req.params.id);

    if (!user.isPlatformAdmin) {
      const requesterMembership = await companyService
        .listMembers(user, organizationId)
        .then((members) => members.find((m) => m.userId === user.id));
      if (requesterMembership?.role !== "GERENTE") {
        throw new ForbiddenError("Apenas Gerente ou Administrador podem ver os códigos de convite.");
      }
    }

    return companyService.listInviteCodes(user, organizationId);
  }),
);

/// Mesma checagem manual de papel (GERENTE/admin) das outras rotas sensíveis
/// desta empresa-alvo acima — gerar convite não é uma ação de leitura comum.
companiesRouter.post(
  "/:id/invite-codes",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const parsed = generateInviteCodeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const organizationId = String(req.params.id);

    if (!user.isPlatformAdmin) {
      const requesterMembership = await companyService
        .listMembers(user, organizationId)
        .then((members) => members.find((m) => m.userId === user.id));
      if (requesterMembership?.role !== "GERENTE") {
        throw new ForbiddenError("Apenas Gerente ou Administrador podem gerar código de convite.");
      }
    }

    const invitation = await companyService.generateInviteCode(
      user,
      organizationId,
      parsed.data.role,
      parsed.data.email,
    );

    await recordAudit(req, user, {
      action: "INVITE_CODE_GENERATED",
      resourceType: "InvitationMember",
      resourceId: invitation.id,
      afterState: { code: invitation.code, role: invitation.role, email: invitation.email },
    });

    return invitation;
  }),
);

/// Resgate na tela de cadastro: usuário acabou de ser criado (signUp.email)
/// e ainda não tem empresa ativa, por isso requireCompany: false — o próprio
/// code identifica a organização de destino.
companiesRouter.post(
  "/redeem-invite",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const parsed = redeemInviteCodeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const organization = await companyService.redeemInviteCode(user, parsed.data.code.trim().toUpperCase());
    const safeCompany = sanitizeCompany(organization);

    await recordAudit(req, user, {
      action: "INVITE_CODE_REDEEMED",
      resourceType: "Company",
      resourceId: organization.id,
      afterState: safeCompany,
    });

    return safeCompany;
  }),
);
