-- CreateTable
CREATE TABLE "Funil" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Funil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldsFunil" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT,
    "useValue" BOOLEAN NOT NULL DEFAULT false,
    "funilId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldsFunil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Funil_organizationId_key" ON "Funil"("organizationId");

-- CreateIndex
CREATE INDEX "FieldsFunil_funilId_idx" ON "FieldsFunil"("funilId");

-- AddForeignKey
ALTER TABLE "Funil" ADD CONSTRAINT "Funil_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldsFunil" ADD CONSTRAINT "FieldsFunil_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "Funil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
