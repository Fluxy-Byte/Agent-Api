-- CreateTable
CREATE TABLE "CrmToBusiness" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmToBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagesCrm" (
    "id" TEXT NOT NULL,
    "nameStage" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "crmToBusinessId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagesCrm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardCrm" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "crmToBusinessId" TEXT NOT NULL,
    "stagesCrmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardCrm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmToBusiness_organizationId_key" ON "CrmToBusiness"("organizationId");

-- CreateIndex
CREATE INDEX "StagesCrm_crmToBusinessId_idx" ON "StagesCrm"("crmToBusinessId");

-- CreateIndex
CREATE UNIQUE INDEX "StagesCrm_crmToBusinessId_position_key" ON "StagesCrm"("crmToBusinessId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CardCrm_targetId_key" ON "CardCrm"("targetId");

-- CreateIndex
CREATE INDEX "CardCrm_crmToBusinessId_idx" ON "CardCrm"("crmToBusinessId");

-- CreateIndex
CREATE INDEX "CardCrm_stagesCrmId_idx" ON "CardCrm"("stagesCrmId");

-- AddForeignKey
ALTER TABLE "CrmToBusiness" ADD CONSTRAINT "CrmToBusiness_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagesCrm" ADD CONSTRAINT "StagesCrm_crmToBusinessId_fkey" FOREIGN KEY ("crmToBusinessId") REFERENCES "CrmToBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCrm" ADD CONSTRAINT "CardCrm_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCrm" ADD CONSTRAINT "CardCrm_crmToBusinessId_fkey" FOREIGN KEY ("crmToBusinessId") REFERENCES "CrmToBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCrm" ADD CONSTRAINT "CardCrm_stagesCrmId_fkey" FOREIGN KEY ("stagesCrmId") REFERENCES "StagesCrm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

