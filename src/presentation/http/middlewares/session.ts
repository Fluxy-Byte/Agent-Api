import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { isMemberRole } from "../../../domain/enums/member-role";
import { UnauthorizedError } from "../../../domain/errors/app-error";
import { auth } from "../../../infrastructure/auth/better-auth";
import { prisma } from "../../../infrastructure/database/prisma/client";
import type { AuthUser } from "../types/auth-user";

export async function getAuthUser(req: Request): Promise<AuthUser> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

  if (!session) {
    throw new UnauthorizedError();
  }

  const activeOrganizationId = session.session.activeOrganizationId ?? null;
  let activeMemberRole = null as AuthUser["activeMemberRole"];

  if (activeOrganizationId) {
    const member = await prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: activeOrganizationId, userId: session.user.id } },
      select: { role: true },
    });

    if (member && isMemberRole(member.role)) {
      activeMemberRole = member.role;
    }
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isPlatformAdmin: session.user.role === "admin",
    activeOrganizationId,
    activeMemberRole,
  };
}
