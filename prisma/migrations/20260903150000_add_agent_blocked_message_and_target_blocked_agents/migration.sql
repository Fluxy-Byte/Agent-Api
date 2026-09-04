-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "blockedMessage" TEXT NOT NULL DEFAULT 'No momento não conseguimos continuar o atendimento por este canal. Se precisar de suporte, entre em contato por outro meio.';
ALTER TABLE "Agent" ALTER COLUMN "blockedMessage" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Target" ADD COLUMN "blockedAgentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
