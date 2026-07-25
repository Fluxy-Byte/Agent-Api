/*
  Warnings:

  - The `role` column on the `member` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "member" DROP COLUMN "role",
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member';

-- DropEnum
DROP TYPE "MemberRole";
