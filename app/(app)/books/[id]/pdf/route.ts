import { GetObjectCommand } from "@aws-sdk/client-s3";

import { auth } from "@/lib/auth/server";
import { R2_BUCKET, r2 } from "@/lib/r2";
import { getBookPdfMeta } from "@/lib/services/books";

// Same-origin PDF stream so pdf.js can fetch the book bytes without needing R2
// CORS configured for the deploy origin. Owner-scoped: a signed-out request is
// 401, a book the caller does not own (or has no PDF) is 404. The body is
// streamed straight from R2; it is private and never cached.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return new Response(null, { status: 401 });
  }

  const { id } = await ctx.params;

  let pdfKey: string | null;
  try {
    ({ pdfKey } = await getBookPdfMeta(session.user.id, id));
  } catch {
    // getBookPdfMeta throws bookNotFound for unknown / unowned books.
    return new Response(null, { status: 404 });
  }
  if (!pdfKey) {
    return new Response(null, { status: 404 });
  }

  const obj = await r2.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: pdfKey }),
  );
  if (!obj.Body) {
    return new Response(null, { status: 404 });
  }

  return new Response(obj.Body.transformToWebStream(), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
