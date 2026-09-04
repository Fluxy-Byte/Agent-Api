-- AlterTable
ALTER TABLE "Target" ADD COLUMN "bsuid" TEXT;
ALTER TABLE "Target" ALTER COLUMN "waId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Target_organizationId_whatsappChannelId_bsuid_key" ON "Target"("organizationId", "whatsappChannelId", "bsuid");
