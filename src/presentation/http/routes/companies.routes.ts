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

export const companiesRouter = Router();

companiesRouter.get(
  "/",
  apiHandler({ requireCompany: false }, async (_req, _res, user) => {
    return companyService.listForUser(user);
  }),
);

companiesRouter.post(
  "/",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const parsed = createCompanySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Dados inválidos.", parsed.error.flatten());

    const company = await companyService.create(user, parsed.data);
    await recordAudit(req, user, {
      action: "COMPANY_CREATED",
      resourceType: "Company",
      resourceId: company.id,
      afterState: company,
    });

    return company;
  }),
);

companiesRouter.get(
  "/:id",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    return companyService.getById(user, String(req.params.id));
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
