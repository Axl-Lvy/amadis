"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Browser-side auth client (form submissions, hooks). Routes through /api/auth/[...path].
export const authClient = createAuthClient();
