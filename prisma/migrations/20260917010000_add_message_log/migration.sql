-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageLog" TEXT NOT NULL,
    "stagio" TEXT NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageLog_messageId_idx" ON "MessageLog"("messageId");

-- CreateIndex
CREATE INDEX "MessageLog_messageLog_stagio_idx" ON "MessageLog"("messageLog", "stagio");
