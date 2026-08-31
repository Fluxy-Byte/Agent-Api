-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "agentId" TEXT;

-- Backfill: melhor aproximação disponível pra campanhas já disparadas é o
-- agente atualmente vinculado ao canal usado — não temos histórico de qual
-- agente estava vinculado no momento exato do disparo antes desta coluna
-- existir. Daqui em diante, agentId é sempre o snapshot do momento do disparo.
UPDATE "Campaign" c
SET "agentId" = wc."agentId"
FROM "WhatsappChannel" wc
WHERE wc.id = c."whatsappChannelId";

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "agentId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Campaign_agentId_idx" ON "Campaign"("agentId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
