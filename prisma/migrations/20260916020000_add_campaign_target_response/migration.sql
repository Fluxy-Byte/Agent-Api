-- AlterTable
ALTER TABLE "CampaignTarget" ADD COLUMN "respondedCampaign" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CampaignTarget" ADD COLUMN "campaignResponse" TEXT;

-- CreateIndex
CREATE INDEX "CampaignTarget_targetId_respondedCampaign_idx" ON "CampaignTarget"("targetId", "respondedCampaign");
