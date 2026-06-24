import { createNeonAuth } from "@neondatabase/auth/next/server";

// Server-side auth instance: .handler(), .middleware(), .getSession() and all Better Auth methods.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
