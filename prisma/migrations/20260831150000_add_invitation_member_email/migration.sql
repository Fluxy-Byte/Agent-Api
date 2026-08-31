-- AlterTable
ALTER TABLE "invitation_member" ADD COLUMN "email" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "invitation_member_email_idx" ON "invitation_member"("email");
