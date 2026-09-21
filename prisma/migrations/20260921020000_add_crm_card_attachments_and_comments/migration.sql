-- AlterTable
ALTER TABLE "CardCrm" ADD COLUMN "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CardCrmComment" (
    "id" TEXT NOT NULL,
    "cardCrmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardCrmComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardCrmComment_cardCrmId_idx" ON "CardCrmComment"("cardCrmId");

-- CreateIndex
CREATE INDEX "CardCrmComment_userId_idx" ON "CardCrmComment"("userId");

-- AddForeignKey
ALTER TABLE "CardCrmComment" ADD CONSTRAINT "CardCrmComment_cardCrmId_fkey" FOREIGN KEY ("cardCrmId") REFERENCES "CardCrm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCrmComment" ADD CONSTRAINT "CardCrmComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
