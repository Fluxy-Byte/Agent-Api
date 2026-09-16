// Script único (não faz parte do app) — preenche respondedCampaign/campaignResponse
// pros CampaignTarget que já foram de fato respondidos pelo cliente ANTES da
// feature existir (Inbound-Service só começou a marcar isso a partir de hoje,
// ver campaign-response-service.ts). Usa a MESMA heurística por janela de tempo
// já usada em report-service.ts#getCampaignMetrics (resposta = mensagem do
// cliente entre este disparo e o próximo, ou entre este disparo e agora se for
// o último) — só que aqui, em vez de só contar, grava o resultado no banco.
//
// Roda pra TODAS as organizações de uma vez. Nunca sobrescreve um
// CampaignTarget que já está respondedCampaign=true (só preenche os que ainda
// estão false), então é seguro rodar de novo (idempotente: só cobre gaps novos
// se existirem, não duplica nem reverte nada).
//
// Uso:
//   npx ts-node -r tsconfig-paths/register scripts/backfill-campaign-responses.ts --dry-run
//   npx ts-node -r tsconfig-paths/register scripts/backfill-campaign-responses.ts
import { MESSAGES_COLLECTION, type MessageDocument } from "../src/domain/contracts/message-document";
import { getMongoDb } from "../src/infrastructure/database/mongo/client";
import { prisma } from "../src/infrastructure/database/prisma/client";

const REACHED_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Todo CampaignTarget que de fato chegou no contato, de qualquer
  // organização — precisamos de TODOS (não só os respondedCampaign=false)
  // pra calcular corretamente o fim da janela de cada disparo (= início do
  // próximo disparo do mesmo contato).
  const allDispatches = await prisma.campaignTarget.findMany({
    where: { status: { in: [...REACHED_STATUSES] } },
    select: { id: true, targetId: true, createdAt: true, respondedCampaign: true },
    orderBy: { createdAt: "asc" },
  });

  const pending = allDispatches.filter((d) => !d.respondedCampaign);
  console.log(`Disparos alcançados no total: ${allDispatches.length}`);
  console.log(`Ainda sem respondedCampaign=true: ${pending.length}`);

  if (pending.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  const dispatchesByTarget = new Map<string, typeof allDispatches>();
  for (const d of allDispatches) {
    const list = dispatchesByTarget.get(d.targetId) ?? [];
    list.push(d);
    dispatchesByTarget.set(d.targetId, list);
  }

  const targetIds = [...dispatchesByTarget.keys()];
  const db = await getMongoDb();
  const customerMessages = await db
    .collection<MessageDocument>(MESSAGES_COLLECTION)
    .find({ targetId: { $in: targetIds }, senderType: "CUSTOMER" }, { projection: { targetId: 1, text: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();

  const repliesByTarget = new Map<string, { text: string; time: number }[]>();
  for (const m of customerMessages) {
    const list = repliesByTarget.get(m.targetId) ?? [];
    list.push({ text: m.text ?? "", time: new Date(m.createdAt).getTime() });
    repliesByTarget.set(m.targetId, list);
  }

  const updates: { id: string; campaignResponse: string }[] = [];

  for (const [targetId, dispatches] of dispatchesByTarget) {
    const sorted = [...dispatches].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const replies = repliesByTarget.get(targetId) ?? [];

    sorted.forEach((dispatch, i) => {
      if (dispatch.respondedCampaign) return;

      const windowStart = dispatch.createdAt.getTime();
      const windowEnd = i + 1 < sorted.length ? sorted[i + 1].createdAt.getTime() : Infinity;
      const reply = replies.find((r) => r.time > windowStart && r.time < windowEnd);
      if (reply) updates.push({ id: dispatch.id, campaignResponse: reply.text });
    });
  }

  console.log(`Disparos que serão marcados como respondidos agora: ${updates.length}`);

  if (dryRun) {
    for (const u of updates.slice(0, 20)) {
      console.log(`  - CampaignTarget ${u.id} -> campaignResponse="${u.campaignResponse.slice(0, 80)}"`);
    }
    if (updates.length > 20) console.log(`  ... e mais ${updates.length - 20}`);
    console.log("\n--dry-run: nenhum CampaignTarget foi alterado.");
    return;
  }

  let updated = 0;
  for (const u of updates) {
    await prisma.campaignTarget.update({
      where: { id: u.id },
      data: { respondedCampaign: true, campaignResponse: u.campaignResponse },
    });
    updated++;
  }

  console.log(`\nConcluído: ${updated} CampaignTarget marcado(s) como respondido(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
