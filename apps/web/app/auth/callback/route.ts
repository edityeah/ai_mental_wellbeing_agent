import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  // Behind Cloudflare Tunnel, request.url shows the container's internal
  // origin (e.g. http://0.0.0.0:3000) — which the browser cannot resolve.
  // Use the forwarded headers Cloudflare sets so the redirect goes to
  // the real public URL.
  const forwardedHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const publicOrigin = `${forwardedProto}://${forwardedHost}`;
  return NextResponse.redirect(new URL("/chat", publicOrigin));
}
