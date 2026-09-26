import { Prisma } from "../../../generated/prisma/client";
import { NotFoundError } from "../../domain/errors/app-error";
import { prisma } from "../../infrastructure/database/prisma/client";
import type { AuthUser } from "../../presentation/http/types/auth-user";
import type { FunnelFieldInput } from "./crm-validation";

/// Limite da lista de contatos de uma etapa — a contagem da etapa é sempre a
/// real, só a listagem é cortada.
const FIELD_TARGETS_LIMIT = 200;

type FunnelFieldRule = { name: string; value: string | null; useValue: boolean };

/// Todo Target.metadata é um Json livre (pares key:value), então a regra da
/// etapa vira SQL cru (mesma abordagem de target-service.ts). `->>` devolve o
/// valor como texto (número/booleano viram texto também) e NULL quando a
/// chave não existe ou é JSON null.
/// - useValue=false: a chave precisa existir com algo preenchido (não vazio).
/// - useValue=true: o valor precisa ser igual ao esperado, ignorando
///   maiúsculas/minúsculas e espaços nas pontas.
function fieldCondition(field: FunnelFieldRule): Prisma.Sql {
  if (field.useValue) {
    return Prisma.sql`lower(trim(metadata ->> ${field.name})) = lower(trim(${field.value ?? ""}))`;
  }
  return Prisma.sql`coalesce(trim(metadata ->> ${field.name}), '') <> ''`;
}

async function countTargets(organizationId: string, field: FunnelFieldRule): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM "Target"
    WHERE "organizationId" = ${organizationId} AND ${fieldCondition(field)}
  `;
  return Number(rows[0]?.count ?? 0);
}

async function getOrCreateFunil(organizationId: string) {
  return prisma.funil.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
}

async function findField(user: AuthUser, fieldId: string) {
  const funil = await getOrCreateFunil(user.activeOrganizationId!);
  const field = await prisma.fieldsFunil.findFirst({ where: { id: fieldId, funilId: funil.id } });
  if (!field) throw new NotFoundError("Etapa do funil não encontrada.");
  return field;
}

export const crmFunnelService = {
  /// Etapas na ordem de criação, cada uma com quantos contatos da empresa
  /// batem com a regra dela — `totalTargets` é o topo do funil.
  async getFunnel(user: AuthUser) {
    const organizationId = user.activeOrganizationId!;
    const funil = await getOrCreateFunil(organizationId);

    const [fields, totalTargets] = await Promise.all([
      prisma.fieldsFunil.findMany({ where: { funilId: funil.id }, orderBy: { createdAt: "asc" } }),
      prisma.target.count({ where: { organizationId } }),
    ]);

    const counts = await Promise.all(fields.map((field) => countTargets(organizationId, field)));

    return {
      id: funil.id,
      totalTargets,
      fields: fields.map((field, i) => ({ ...field, count: counts[i] })),
    };
  },

  async createField(user: AuthUser, input: FunnelFieldInput) {
    const funil = await getOrCreateFunil(user.activeOrganizationId!);
    return prisma.fieldsFunil.create({ data: { ...input, funilId: funil.id } });
  },

  async updateField(user: AuthUser, fieldId: string, input: FunnelFieldInput) {
    const field = await findField(user, fieldId);
    return prisma.fieldsFunil.update({ where: { id: field.id }, data: input });
  },

  async deleteField(user: AuthUser, fieldId: string) {
    const field = await findField(user, fieldId);
    await prisma.fieldsFunil.delete({ where: { id: field.id } });
    return field;
  },

  /// Contatos que batem com a regra da etapa, com o valor encontrado no
  /// metadata pra conferência na tela.
  async getFieldTargets(user: AuthUser, fieldId: string) {
    const organizationId = user.activeOrganizationId!;
    const field = await findField(user, fieldId);

    const [items, total] = await Promise.all([
      prisma.$queryRaw<
        { id: string; name: string | null; waId: string | null; email: string | null; metadataValue: string | null }[]
      >`
        SELECT id, name, "waId", email, metadata ->> ${field.name} AS "metadataValue"
        FROM "Target"
        WHERE "organizationId" = ${organizationId} AND ${fieldCondition(field)}
        ORDER BY "updatedAt" DESC
        LIMIT ${FIELD_TARGETS_LIMIT}
      `,
      countTargets(organizationId, field),
    ]);

    return { field, items, total };
  },
};
