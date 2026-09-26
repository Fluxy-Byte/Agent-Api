-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('FINISHED', 'RESCHEDULED', 'CANCELED');

-- CreateTable
CREATE TABLE "CalendarOrganization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "calendarOrganizationId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "dateEvent" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "status" "EventStatus",
    "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventAnnotation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarOrganization_organizationId_key" ON "CalendarOrganization"("organizationId");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarOrganizationId_dateEvent_idx" ON "CalendarEvent"("calendarOrganizationId", "dateEvent");

-- CreateIndex
CREATE INDEX "CalendarEvent_targetId_idx" ON "CalendarEvent"("targetId");

-- CreateIndex
CREATE INDEX "CalendarEventAnnotation_eventId_idx" ON "CalendarEventAnnotation"("eventId");

-- CreateIndex
CREATE INDEX "CalendarEventAnnotation_userId_idx" ON "CalendarEventAnnotation"("userId");

-- AddForeignKey
ALTER TABLE "CalendarOrganization" ADD CONSTRAINT "CalendarOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarOrganizationId_fkey" FOREIGN KEY ("calendarOrganizationId") REFERENCES "CalendarOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventAnnotation" ADD CONSTRAINT "CalendarEventAnnotation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventAnnotation" ADD CONSTRAINT "CalendarEventAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
