import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LogoWordmark } from "@/components/brand/Logo";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Legal + crisis pages — must be publicly accessible (privacy compliance:
 * prospective users need to read the privacy policy *before* signing up).
 *
 * If the visitor is authenticated, we render them inside the AppShell
 * (so the sidebar with threads + user menu is visible and the page
 * doesn't feel like a context switch). If they're not, fall back to a
 * minimal public shell with just the logo and footer cross-links.
 */
export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Authenticated: render inside the same shell as /chat. Pad the
    // canvas content for readable line length.
    return (
      <AppShell>
        <div className="flex-1 overflow-y-auto bg-cream">
          <div className="max-w-3xl mx-auto px-6 py-8 md:py-12">{children}</div>
        </div>
      </AppShell>
    );
  }

  // Public: minimal chrome.
  return (
    <div className="min-h-screen-dvh bg-cream text-ink">
      <header className="border-b border-cream-edge bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" aria-label="Home">
            <LogoWordmark size={28} />
          </Link>
          <Link href="/login" className="text-sm text-sage hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10 md:py-14">{children}</main>
      <footer className="border-t border-cream-edge bg-white">
        <div className="max-w-3xl mx-auto px-6 py-6 text-xs text-mute flex flex-wrap gap-x-5 gap-y-2 justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/legal/privacy" className="hover:text-sage">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-sage">
              Terms
            </Link>
            <Link href="/legal/disclaimer" className="hover:text-sage">
              Disclaimer
            </Link>
            <Link href="/crisis-resources" className="hover:text-sage">
              Crisis resources
            </Link>
          </div>
          <div>© {new Date().getFullYear()} Wellbeing</div>
        </div>
      </footer>
    </div>
  );
}
