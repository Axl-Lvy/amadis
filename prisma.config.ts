import path from "node:path";

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env; load local env so DIRECT_URL is available to migrate.
config({ path: ".env.local" });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  // Migrate / introspect connect over the DIRECT (non-pooled) connection.
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
