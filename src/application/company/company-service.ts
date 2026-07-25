import { randomUUID } from "crypto";
import { isMemberRole } from "../../domain/enums/member-role";
import { ForbiddenError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { slugify } from "../../domain/utils/slug";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

export const companyService = {
  /// Sempre cria Organization + Member(GERENTE) diretamente — nunca pela API de
  /// criação de organização do Better Auth, pra garantir que o Member nasça com
  /// um valor válido do nosso union type de papéis, não o default do plugin.
  async create(user: AuthUser, input: { name: string; cnpj: string }) {
    const organization = await prisma.organization.create({
      data: {
        id: randomUUID(),
        name: input.name,
        slug: slugify(input.name),
        cnpj: input.cnpj,
        status: "ACTIVE",
        createdAt: new Date(),
      },
    });

    await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: organization.id,
        userId: user.id,
        role: "GERENTE",
        createdAt: new Date(),
      },
    });

    return organization;
  },

  async listForUser(user: AuthUser) {
    if (user.isPlatformAdmin) {
      return prisma.organization.findMany({ orderBy: { createdAt: "desc" } });
    }

    const memberships = await prisma.member.findMany({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: "desc" },
    });

    return memberships.map((m) => m.organization);
  },

  async getById(user: AuthUser, organizationId: string) {
    if (!user.isPlatformAdmin) {
      const member = await prisma.member.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      });
      if (!member) throw new ForbiddenError("Você não tem acesso a esta empresa.");
    }

    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundError("Empresa não encontrada.");

    return organization;
  },

  async listMembers(user: AuthUser, organizationId: string) {
    await this.getById(user, organizationId);

    return prisma.member.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    });
  },

  /// Tela de Acessos: "Tipo de acesso" de um usuário dentro da empresa.
  /// Administrador não é editável aqui — é a flag global do plugin admin do
  /// Better Auth, fora do escopo de uma organização específica.
  async updateMemberRole(user: AuthUser, organizationId: string, memberId: string, role: string) {
    await this.getById(user, organizationId);

    if (!isMemberRole(role)) {
      throw new ValidationError("Tipo de acesso inválido.");
    }

    const member = await prisma.member.findFirst({ where: { id: memberId, organizationId } });
    if (!member) throw new NotFoundError("Usuário não encontrado nesta empresa.");

    return prisma.member.update({
      where: { id: member.id },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
  },
};
