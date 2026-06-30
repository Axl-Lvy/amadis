-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "book" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "pdf_key" TEXT,
    "page_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passage" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "start_page" INTEGER,
    "start_frac" DOUBLE PRECISION,
    "end_page" INTEGER,
    "end_frac" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "type" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "passage_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_tag" (
    "placement_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,

    CONSTRAINT "placement_tag_pkey" PRIMARY KEY ("placement_id","tag_id")
);

-- CreateTable
CREATE TABLE "placement_ref" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_ref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "passage_id" TEXT NOT NULL,
    "label" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "scan_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "book_owner_id_idx" ON "book"("owner_id");

-- CreateIndex
CREATE INDEX "passage_owner_id_idx" ON "passage"("owner_id");

-- CreateIndex
CREATE INDEX "passage_book_id_idx" ON "passage"("book_id");

-- CreateIndex
CREATE INDEX "tag_owner_id_idx" ON "tag"("owner_id");

-- CreateIndex
CREATE INDEX "tag_parent_id_idx" ON "tag"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_owner_id_parent_id_name_key" ON "tag"("owner_id", "parent_id", "name");

-- CreateIndex
CREATE INDEX "placement_owner_id_idx" ON "placement"("owner_id");

-- CreateIndex
CREATE INDEX "placement_passage_id_idx" ON "placement"("passage_id");

-- CreateIndex
CREATE INDEX "placement_passage_id_field_start_end_idx" ON "placement"("passage_id", "field", "start", "end");

-- CreateIndex
CREATE INDEX "placement_tag_tag_id_idx" ON "placement_tag"("tag_id");

-- CreateIndex
CREATE INDEX "placement_tag_owner_id_idx" ON "placement_tag"("owner_id");

-- CreateIndex
CREATE INDEX "placement_ref_owner_id_idx" ON "placement_ref"("owner_id");

-- CreateIndex
CREATE INDEX "placement_ref_source_id_idx" ON "placement_ref"("source_id");

-- CreateIndex
CREATE INDEX "placement_ref_target_id_idx" ON "placement_ref"("target_id");

-- CreateIndex
CREATE INDEX "variant_owner_id_idx" ON "variant"("owner_id");

-- CreateIndex
CREATE INDEX "variant_passage_id_idx" ON "variant"("passage_id");

-- AddForeignKey
ALTER TABLE "passage" ADD CONSTRAINT "passage_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_tag" ADD CONSTRAINT "placement_tag_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_tag" ADD CONSTRAINT "placement_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_ref" ADD CONSTRAINT "placement_ref_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant" ADD CONSTRAINT "variant_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passage"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Root-tag uniqueness: @@unique([owner_id, parent_id, name]) does not constrain
-- roots because Postgres treats NULL parent_id as distinct. Enforce one root per
-- (owner, type, name) with a partial unique index. Roots always carry a type.
CREATE UNIQUE INDEX "tag_root_owner_id_type_name_key" ON "tag"("owner_id", "type", "name") WHERE "parent_id" IS NULL;
