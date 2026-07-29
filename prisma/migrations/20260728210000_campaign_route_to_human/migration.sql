-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "routeToQueueId" TEXT,
ADD COLUMN     "routeToUserId" TEXT;

-- CreateIndex
CREATE INDEX "Campaign_routeToQueueId_idx" ON "Campaign"("routeToQueueId");

-- CreateIndex
CREATE INDEX "Campaign_routeToUserId_idx" ON "Campaign"("routeToUserId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_routeToQueueId_fkey" FOREIGN KEY ("routeToQueueId") REFERENCES "Queue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_routeToUserId_fkey" FOREIGN KEY ("routeToUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
