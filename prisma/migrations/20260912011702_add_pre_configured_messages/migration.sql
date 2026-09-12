-- CreateTable
CREATE TABLE "PreConfiguredMessage" (
    "id" TEXT NOT NULL,
    "serviceIslandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreConfiguredMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PreConfiguredMessageQueues" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PreConfiguredMessageQueues_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "PreConfiguredMessage_serviceIslandId_idx" ON "PreConfiguredMessage"("serviceIslandId");

-- CreateIndex
CREATE UNIQUE INDEX "PreConfiguredMessage_serviceIslandId_name_key" ON "PreConfiguredMessage"("serviceIslandId", "name");

-- CreateIndex
CREATE INDEX "_PreConfiguredMessageQueues_B_index" ON "_PreConfiguredMessageQueues"("B");

-- AddForeignKey
ALTER TABLE "PreConfiguredMessage" ADD CONSTRAINT "PreConfiguredMessage_serviceIslandId_fkey" FOREIGN KEY ("serviceIslandId") REFERENCES "ServiceIsland"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreConfiguredMessageQueues" ADD CONSTRAINT "_PreConfiguredMessageQueues_A_fkey" FOREIGN KEY ("A") REFERENCES "PreConfiguredMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreConfiguredMessageQueues" ADD CONSTRAINT "_PreConfiguredMessageQueues_B_fkey" FOREIGN KEY ("B") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
