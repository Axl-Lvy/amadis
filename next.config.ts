import type { NextConfig } from "next";

// In CI the build skips its built-in TypeScript pass because a dedicated
// `typecheck` step already runs in parallel. The Vercel production build leaves
// it on (this flag is set only by the CI workflow), so prod stays strict.
// Next 16 no longer lints during `next build`, so there is no eslint toggle.
const skipBuildChecks = process.env.NEXT_BUILD_SKIP_CHECKS === "true";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: skipBuildChecks },
};

export default nextConfig;
