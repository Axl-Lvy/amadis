import { auth } from "@/lib/auth/server";

// Catch-all proxy for all Neon Auth API calls (sign in/up, sessions, OAuth callbacks).
export const { GET, POST } = auth.handler();
