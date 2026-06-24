import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// One jsdom environment covers every suite: pure helpers, server actions (with
// Prisma/R2 mocked), and React components. Path alias mirrors tsconfig "@/*".
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: ["lib/**", "app/**"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/layout.tsx",
        "**/page.tsx",
        "app/api/**",
      ],
    },
  },
});
