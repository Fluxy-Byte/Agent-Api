-- DropIndex
DROP INDEX "WhatsappChannel_wabaId_key";

-- CreateIndex
CREATE INDEX "WhatsappChannel_wabaId_idx" ON "WhatsappChannel"("wabaId");
