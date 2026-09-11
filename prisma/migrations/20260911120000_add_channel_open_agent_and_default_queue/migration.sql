-- AlterTable
-- WhatsappChannel.agentId deixa de ser obrigatório: um canal agora pode
-- existir sem nenhum agente de IA vinculado (atendimento 100% humano).
ALTER TABLE "WhatsappChannel" ALTER COLUMN "agentId" DROP NOT NULL;

-- AlterTable
-- openAgent decide se o Inbound-Service manda as mensagens pro agente de IA
-- (true) ou direto pro atendimento humano via idServiceIslandDefault (false).
ALTER TABLE "WhatsappChannel" ADD COLUMN "openAgent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
-- Guarda o id da Queue (fila) que recebe o atendimento quando openAgent=false.
ALTER TABLE "WhatsappChannel" ADD COLUMN "idServiceIslandDefault" TEXT;

-- AlterTable
-- Marca a fila "Default" criada automaticamente junto com a ilha de
-- atendimento — nunca pode ser excluída (ver queue-service.ts).
ALTER TABLE "Queue" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "WhatsappChannel_idServiceIslandDefault_idx" ON "WhatsappChannel"("idServiceIslandDefault");

-- AddForeignKey
ALTER TABLE "WhatsappChannel" ADD CONSTRAINT "WhatsappChannel_idServiceIslandDefault_fkey" FOREIGN KEY ("idServiceIslandDefault") REFERENCES "Queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: preserva o comportamento atual de todo canal já cadastrado — como
-- antes desta migration agentId era obrigatório, todo canal existente já tem
-- um agente vinculado e deve continuar mandando as mensagens pra IA
-- normalmente. Canais criados a partir de agora nascem com openAgent=false e
-- só viram true se um agente for selecionado na hora da criação (ver
-- whatsapp-channel-service.ts).
UPDATE "WhatsappChannel" SET "openAgent" = true WHERE "agentId" IS NOT NULL;
