import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";

/**
 * The shell for every authenticated route — chat, profile, insights,
 * legal, crisis resources. The sidebar (with threads + user menu) lives
 * here, so it persists across all middle-canvas swaps. Each page just
 * renders its content; the sidebar is always there.
 *
 * /onboarding overrides this with its own bare layout so we don't show
 * the threads pane during a focused first-run flow.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
