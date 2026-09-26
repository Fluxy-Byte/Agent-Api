-- AlterTable
ALTER TABLE "Queue" ADD COLUMN     "carteiraEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceIsland" ADD COLUMN     "allowAttendantCarteira" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Carteira" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carteira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Carteira_queueId_idx" ON "Carteira"("queueId");

-- CreateIndex
CREATE INDEX "Carteira_targetIds_idx" ON "Carteira" USING GIN ("targetIds");

-- AddForeignKey
ALTER TABLE "Carteira" ADD CONSTRAINT "Carteira_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
