import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible. region "auto", endpoint is the account R2 host.
// Credentials and bucket come from env (per Vercel environment): dev bucket for
// Preview/Development, prod bucket for Production. Never committed to the repo.
const accountId = process.env.R2_ACCOUNT_ID!;

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET!;

// Presign a PUT so the browser uploads bytes straight to R2 (never via Vercel).
export function presignPut(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

// Presign a GET to read a stored object back (owner checks happen in the service).
export function presignGet(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn },
  );
}
