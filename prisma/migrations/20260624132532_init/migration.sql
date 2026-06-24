-- CreateTable
CREATE TABLE "texte" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "source" TEXT,
    "scan_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "texte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "texte_id" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "tag_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "texte_owner_id_idx" ON "texte"("owner_id");

-- CreateIndex
CREATE INDEX "tag_owner_id_idx" ON "tag"("owner_id");

-- CreateIndex
CREATE INDEX "tag_layer_idx" ON "tag"("layer");

-- CreateIndex
CREATE UNIQUE INDEX "tag_owner_id_layer_code_key" ON "tag"("owner_id", "layer", "code");

-- CreateIndex
CREATE INDEX "annotation_owner_id_idx" ON "annotation"("owner_id");

-- CreateIndex
CREATE INDEX "annotation_texte_id_idx" ON "annotation"("texte_id");

-- CreateIndex
CREATE INDEX "annotation_tag_id_idx" ON "annotation"("tag_id");

-- CreateIndex
CREATE INDEX "annotation_texte_id_start_end_idx" ON "annotation"("texte_id", "start", "end");

-- AddForeignKey
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_texte_id_fkey" FOREIGN KEY ("texte_id") REFERENCES "texte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
