-- CreateEnum
CREATE TYPE "RagDocumentStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "personality" TEXT,
ADD COLUMN "ragEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ragChunkSize" INTEGER;

-- CreateTable
CREATE TABLE "RagDocument" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "categories" TEXT[],
    "chunkSize" INTEGER NOT NULL,
    "status" "RagDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "chunkCount" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RagDocument_agentId_idx" ON "RagDocument"("agentId");

-- AddForeignKey
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
