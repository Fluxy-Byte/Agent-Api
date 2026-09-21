-- CreateEnum
CREATE TYPE "CardPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "CardCrm" ADD COLUMN "statusPriority" "CardPriority" NOT NULL DEFAULT 'LOW';
