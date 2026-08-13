-- CreateEnum
CREATE TYPE "AttendantStatus" AS ENUM ('ONLINE', 'PAUSED', 'OFFLINE');

-- AlterTable
ALTER TABLE "member" ADD COLUMN "status" "AttendantStatus" NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE "member" ADD COLUMN "statusUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ServiceIsland" ADD COLUMN "allowActiveDispatch" BOOLEAN NOT NULL DEFAULT false;
