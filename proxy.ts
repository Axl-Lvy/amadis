import { auth } from "@/lib/auth/server";

// Next.js 16 uses proxy.ts in place of middleware.ts.
export default auth.middleware({
  loginUrl: "/auth/sign-in",
});

// Only /dashboard is guarded at the middleware layer. The rest of the
// authenticated app (/books, /tags, …) is guarded by the (app) layout's
// auth.getSession() redirect — matching them here would also route their server
// action POSTs through the auth middleware, which breaks the action response
// ("An unexpected response was received from the server").
export const config = {
  matcher: ["/dashboard/:path*"],
};
