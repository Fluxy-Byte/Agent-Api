-- AlterTable
ALTER TABLE "WhatsappChannel" ADD COLUMN "wordsToReset" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
