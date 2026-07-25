import type { Request } from "express";
import { prisma } from "../../../infrastructure/database/prisma/client";
import type { AuthUser } from "../types/auth-user";

interface RecordAuditInput {
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: unknown;
  afterState?: unknown;
}

export async function recordAudit(req: Request, user: AuthUser, input: RecordAuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: user.activeOrganizationId,
      userId: user.id,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      beforeState: input.beforeState === undefined ? undefined : (input.beforeState as object),
      afterState: input.afterState === undefined ? undefined : (input.afterState as object),
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });
}
