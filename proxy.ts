import { auth } from "@/lib/auth/server";

// Next.js 16 uses proxy.ts in place of middleware.ts.
export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
