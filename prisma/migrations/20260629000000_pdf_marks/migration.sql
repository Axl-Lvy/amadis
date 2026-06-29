-- CreateTable
CREATE TABLE "mark" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "frac" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mark_owner_id_idx" ON "mark"("owner_id");

-- CreateIndex
CREATE INDEX "mark_book_id_idx" ON "mark"("book_id");

-- AddForeignKey
ALTER TABLE "mark" ADD CONSTRAINT "mark_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "passage" DROP COLUMN "end_frac",
DROP COLUMN "end_page",
DROP COLUMN "start_frac",
DROP COLUMN "start_page";
