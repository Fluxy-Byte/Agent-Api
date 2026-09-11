// Script único (não faz parte do app) — cria a fila "Default" (isDefault:
// true) em toda ServiceIsland que ainda não tem uma, pra colocar as ilhas
// criadas antes da feature de openAgent/idServiceIslandDefault em dia com as
// criadas depois (essas já nascem com a fila automaticamente, ver
// whatsapp-channel-service.ts#createChannelWithIsland).
//
// Idempotente: rodar de novo não duplica nada (só cria pra ilha que ainda não
// tem isDefault=true). Uso:
//   npx ts-node -r tsconfig-paths/register scripts/backfill-default-queues.ts --dry-run
//   npx ts-node -r tsconfig-paths/register scripts/backfill-default-queues.ts
import { prisma } from "../src/infrastructure/database/prisma/client";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const islandsWithoutDefault = await prisma.serviceIsland.findMany({
    where: { queues: { none: { isDefault: true } } },
    select: { id: true, name: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Ilhas de atendimento sem fila Default: ${islandsWithoutDefault.length}`);
  for (const island of islandsWithoutDefault) {
    console.log(`  - ${island.id}  org=${island.organizationId}  "${island.name}"`);
  }

  if (islandsWithoutDefault.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  if (dryRun) {
    console.log("\n--dry-run: nenhuma fila foi criada.");
    return;
  }

  let created = 0;
  for (const island of islandsWithoutDefault) {
    const queue = await prisma.queue.create({
      data: { serviceIslandId: island.id, name: "Default", isDefault: true },
    });
    console.log(`Criada fila Default ${queue.id} para a ilha ${island.id} ("${island.name}")`);
    created++;
  }

  console.log(`\nConcluído: ${created} fila(s) Default criada(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
