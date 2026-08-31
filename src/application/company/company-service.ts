import { randomBytes, randomInt, randomUUID } from "crypto";
import { isMemberRole } from "../../domain/enums/member-role";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../domain/errors/app-error";
import { slugify } from "../../domain/utils/slug";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";

/// Sem 0/O/1/I/L — código digitado à mão, não pode ter caracteres ambíguos.
const INVITE_CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_CODE_CHARSET[randomInt(INVITE_CODE_CHARSET.length)];
  }
  return code;
}

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

  /// Gera (ou rotaciona) o token de acesso à API externa (Fluxy Agents) desta
  /// empresa — o valor bruto só existe nesta resposta, nunca mais é devolvido
  /// em claro (ver sanitizeCompany em companies.routes.ts).
  async generateApiToken(user: AuthUser, organizationId: string) {
    await this.getById(user, organizationId);

    const token = randomBytes(32).toString("hex");
    await prisma.organization.update({
      where: { id: organizationId },
      data: { tokenAcessApi: token },
    });

    return { token };
  },

  /// Gera um código de convite (invitationMember) para a empresa, com o papel
  /// que será concedido a quem resgatar — quem resgata não escolhe o papel,
  /// quem convida sim, na hora da geração.
  async generateInviteCode(user: AuthUser, organizationId: string, role: string) {
    await this.getById(user, organizationId);

    if (!isMemberRole(role)) {
      throw new ValidationError("Papel inválido.");
    }

    return prisma.invitationMember.create({
      data: { organizationId, code: generateInviteCode(), role, finish: true },
    });
  },

  async listInviteCodes(user: AuthUser, organizationId: string) {
    await this.getById(user, organizationId);

    return prisma.invitationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  },

  /// Resgate do código na tela de cadastro (signup): o code precisa existir e
  /// ainda estar ativo (finish=true). O updateMany com finish=true na cláusula
  /// where funciona como compare-and-swap — se duas requisições concorrentes
  /// tentarem resgatar o mesmo code, só uma consegue afetar 1 linha; a outra
  /// recebe count 0 e sabe que perdeu a corrida, sem precisar de lock explícito.
  async redeemInviteCode(user: AuthUser, code: string) {
    const invitation = await prisma.invitationMember.findUnique({ where: { code } });
    if (!invitation) throw new NotFoundError("Código de convite inválido.");

    const existingMember = await prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
    });
    if (existingMember) throw new ConflictError("Você já faz parte desta empresa.");

    const claimed = await prisma.invitationMember.updateMany({
      where: { id: invitation.id, finish: true },
      data: { finish: false, userId: user.id },
    });
    if (claimed.count === 0) throw new ConflictError("Este código de convite já foi utilizado.");

    await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
        createdAt: new Date(),
      },
    });

    return prisma.organization.findUniqueOrThrow({ where: { id: invitation.organizationId } });
  },
};
