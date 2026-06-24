import type { NextConfig } from "next";

// In CI the build skips its built-in lint and type passes because dedicated
// `lint` and `typecheck` steps already run in parallel. The Vercel production
// build leaves these on (this flag is set only by the CI workflow), so prod
// stays strict.
const skipBuildChecks = process.env.NEXT_BUILD_SKIP_CHECKS === "true";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: skipBuildChecks },
  typescript: { ignoreBuildErrors: skipBuildChecks },
};

export default nextConfig;
