/**
 * Bare onboarding layout — overrides the parent (app) layout so the
 * threads sidebar doesn't appear during the focused first-run flow.
 * Once the user finishes onboarding they're routed to /chat which
 * picks up the full AppShell again.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-screen-dvh flex w-full">{children}</div>;
}
