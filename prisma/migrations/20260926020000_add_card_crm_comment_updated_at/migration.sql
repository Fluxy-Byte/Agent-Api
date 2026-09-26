-- AlterTable
-- Comentários existentes ganham updatedAt = createdAt (nunca foram editados).
-- O default só existe pra preencher as linhas antigas: @updatedAt é
-- preenchido pelo Prisma Client, então ele é removido em seguida.
ALTER TABLE "CardCrmComment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "CardCrmComment" SET "updatedAt" = "createdAt";
ALTER TABLE "CardCrmComment" ALTER COLUMN "updatedAt" DROP DEFAULT;
