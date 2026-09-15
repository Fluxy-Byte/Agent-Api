-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "wordsToBlockCampaign" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Channel" ADD COLUMN "useWordsToBlockCampaign" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TargetBlockCampaign" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "whatsappChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetBlockCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TargetBlockCampaign_whatsappChannelId_idx" ON "TargetBlockCampaign"("whatsappChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetBlockCampaign_targetId_whatsappChannelId_key" ON "TargetBlockCampaign"("targetId", "whatsappChannelId");

-- AddForeignKey
ALTER TABLE "TargetBlockCampaign" ADD CONSTRAINT "TargetBlockCampaign_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetBlockCampaign" ADD CONSTRAINT "TargetBlockCampaign_whatsappChannelId_fkey" FOREIGN KEY ("whatsappChannelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
