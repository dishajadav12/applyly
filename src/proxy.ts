import { NextResponse } from "next/server";

// Next.js 16 proxy (formerly middleware.ts). Phase 4: session refresh + protect /dashboard.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
