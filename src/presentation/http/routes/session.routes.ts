import { fromNodeHeaders } from "better-auth/node";
import { Router } from "express";
import { z } from "zod";
import { companyService } from "../../../application/company/company-service";
import { ForbiddenError, NotFoundError, ValidationError } from "../../../domain/errors/app-error";
import { auth } from "../../../infrastructure/auth/better-auth";
import { apiHandler } from "../middlewares/api-handler";
import { recordAudit } from "../middlewares/audit";

const activeCompanySchema = z.object({ companyId: z.string().min(1) });

export const sessionRouter = Router();

/// Tela `/business`: grava a empresa escolhida em Session.activeOrganizationId.
/// Administrador (flag de plataforma) pode ativar qualquer empresa; os demais
/// só empresas às quais pertencem (Member).
sessionRouter.post(
  "/active-company",
  apiHandler({ requireCompany: false }, async (req, _res, user) => {
    const parsed = activeCompanySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Necessário informar companyId.", parsed.error.flatten());

    const companyId = parsed.data.companyId;

    if (!user.isPlatformAdmin) {
      const companies = await companyService.listForUser(user);
      if (!companies.some((c) => c.id === companyId)) {
        throw new ForbiddenError("Você não pertence a esta empresa.");
      }
    }

    const company = await companyService.getById(user, companyId).catch(() => null);
    if (!company) throw new NotFoundError("Empresa não encontrada.");

    await auth.api.setActiveOrganization({
      body: { organizationId: companyId },
      headers: fromNodeHeaders(req.headers),
    });

    await recordAudit(req, user, {
      action: "COMPANY_ACTIVATED",
      resourceType: "Company",
      resourceId: companyId,
    });

    return company;
  }),
);
