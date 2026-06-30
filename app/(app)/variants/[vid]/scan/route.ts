import { GetObjectCommand } from "@aws-sdk/client-s3";

import { auth } from "@/lib/auth/server";
import { R2_BUCKET, r2 } from "@/lib/r2";
import { getVariant } from "@/lib/services/variants";

// Same-origin stream for a variant's scan (image or PDF) so the browser — and
// pdf.js for PDF scans — can fetch the bytes without R2 CORS configured for the
// deploy origin (the same reason the book PDF has its own proxy route). Owner-
// scoped: signed-out is 401; an unowned variant or one with no scan is 404.
function contentTypeFor(key: string): string {
  const k = key.toLowerCase();
  if (k.endsWith(".pdf")) return "application/pdf";
  if (k.endsWith(".png")) return "image/png";
  if (k.endsWith(".jpg") || k.endsWith(".jpeg")) return "image/jpeg";
  if (k.endsWith(".webp")) return "image/webp";
  if (k.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ vid: string }> },
) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return new Response(null, { status: 401 });
  }

  const { vid } = await ctx.params;

  let scanKey: string | null;
  try {
    ({ scanKey } = await getVariant(session.user.id, vid));
  } catch {
    // getVariant throws variantNotFound for unknown / unowned variants.
    return new Response(null, { status: 404 });
  }
  if (!scanKey) {
    return new Response(null, { status: 404 });
  }

  const obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: scanKey }));
  if (!obj.Body) {
    return new Response(null, { status: 404 });
  }

  return new Response(obj.Body.transformToWebStream(), {
    headers: {
      "Content-Type": contentTypeFor(scanKey),
      "Cache-Control": "private, no-store",
    },
  });
}
