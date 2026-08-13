-- AlterTable
ALTER TABLE "organization" ADD COLUMN "tokenAcessApi" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organization_tokenAcessApi_key" ON "organization"("tokenAcessApi");
