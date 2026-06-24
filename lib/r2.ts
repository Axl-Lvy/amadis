import { S3Client } from "@aws-sdk/client-s3";

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
