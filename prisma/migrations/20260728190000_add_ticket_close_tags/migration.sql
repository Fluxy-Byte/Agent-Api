-- AlterTable
ALTER TABLE "ServiceIsland" ADD COLUMN     "requireCloseTag" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "closeTagId" TEXT;

-- CreateTable
CREATE TABLE "TicketCloseTag" (
    "id" TEXT NOT NULL,
    "serviceIslandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketCloseTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketCloseTag_serviceIslandId_idx" ON "TicketCloseTag"("serviceIslandId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCloseTag_serviceIslandId_name_key" ON "TicketCloseTag"("serviceIslandId", "name");

-- CreateIndex
CREATE INDEX "Ticket_closeTagId_idx" ON "Ticket"("closeTagId");

-- AddForeignKey
ALTER TABLE "TicketCloseTag" ADD CONSTRAINT "TicketCloseTag_serviceIslandId_fkey" FOREIGN KEY ("serviceIslandId") REFERENCES "ServiceIsland"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_closeTagId_fkey" FOREIGN KEY ("closeTagId") REFERENCES "TicketCloseTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
