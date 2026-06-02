export const metadata = { title: "Privacy Policy — Wellbeing" };

/**
 * Privacy policy. India-applicable framing — DPDP Act 2023 + IT Act 2000.
 * THIS IS A TEMPLATE STARTING POINT, NOT LEGAL ADVICE. Have a lawyer
 * review before going live, especially for mental health data handling.
 */
export default function PrivacyPage() {
  const updated = "June 2, 2026";
  return (
    <article className="prose-article">
      <h1 className="font-serif text-3xl text-sage mb-2">Privacy Policy</h1>
      <p className="text-sm text-mute mb-8">Last updated: {updated}</p>

      <Section title="What this is">
        <p>
          Wellbeing (&quot;we&quot;, &quot;us&quot;) is a mental wellbeing
          chat and voice companion. This policy explains what data we
          collect when you use the service, how we use it, how long we
          keep it, and the choices you have. We follow the spirit of the
          Digital Personal Data Protection Act, 2023 (DPDP) and the
          Information Technology Act, 2000.
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account info</strong> — your email address (for
            sign-in via magic link) and an optional display name.
          </li>
          <li>
            <strong>Your conversations</strong> — the text and voice
            messages you exchange with the Companion. Voice calls are
            transcribed by speech-to-text and stored as text. We do not
            retain audio recordings.
          </li>
          <li>
            <strong>Your progressive profile</strong> — structured notes
            the Companion extracts from your conversations (stressors,
            coping strategies, sleep patterns, support system, goals,
            notable events). You can view and edit this on the Profile
            page.
          </li>
          <li>
            <strong>Care plans</strong> — short summaries generated at the
            end of substantive conversations.
          </li>
          <li>
            <strong>Usage</strong> — daily message and voice-minute counts
            (for rate limiting), the date/time of each message, and the
            risk classification assigned to each turn (none / elevated /
            acute).
          </li>
          <li>
            <strong>Technical data</strong> — standard server logs (IP
            address, browser type, request times). These help us debug
            errors and detect abuse.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect: precise location, contacts,
          camera/microphone access outside an active voice call, or any
          biometric data.
        </p>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To run the chat and voice service for you.</li>
          <li>
            To remember context across your conversations — so the
            Companion knows what you&apos;ve already shared.
          </li>
          <li>To detect acute risk and surface crisis resources.</li>
          <li>To enforce daily usage limits.</li>
          <li>
            To improve the product. We do <strong>not</strong> sell your
            data or share it with advertisers. We do not use your personal
            conversations to train external AI models.
          </li>
        </ul>
      </Section>

      <Section title="Who processes your data">
        <p>
          We use the following third-party processors. Each is bound by
          their own privacy and security commitments:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — authentication, database, file
            storage.
          </li>
          <li>
            <strong>Anthropic</strong> — large language model that powers
            the Companion. Per Anthropic&apos;s commercial terms, your
            conversations are not used to train their models.
          </li>
          <li>
            <strong>Deepgram</strong> — speech-to-text for voice calls.
          </li>
          <li>
            <strong>Cartesia</strong> — text-to-speech for voice calls.
          </li>
          <li>
            <strong>LiveKit</strong> — real-time audio infrastructure for
            voice calls.
          </li>
          <li>
            <strong>Resend</strong> — transactional email (sign-in
            links).
          </li>
        </ul>
      </Section>

      <Section title="How long we keep it">
        <ul>
          <li>
            <strong>Conversations and profile</strong>: until you delete
            them or your account.
          </li>
          <li>
            <strong>Server logs</strong>: 30 days, then rotated.
          </li>
          <li>
            <strong>Voice audio</strong>: not retained — discarded once
            the transcript is generated.
          </li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>You can:</p>
        <ul>
          <li>
            <strong>Access</strong> what we hold — visit the Profile and
            Insights pages to see everything we&apos;ve captured.
          </li>
          <li>
            <strong>Correct</strong> it — directly edit any field on the
            Profile page.
          </li>
          <li>
            <strong>Delete</strong> any individual conversation from the
            sidebar.
          </li>
          <li>
            <strong>Delete your entire account and data</strong> — email
            us at <a href="mailto:hello@adityeah.ai">hello@adityeah.ai</a>{" "}
            and we will erase everything within 30 days.
          </li>
          <li>
            <strong>Withdraw consent</strong> — at any time, by deleting
            your account.
          </li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit (TLS) and at rest (the database
          host&apos;s standard encryption). Access is limited to the
          minimum set of operators required to keep the service running.
          We do not display passwords (sign-in is passwordless).
        </p>
      </Section>

      <Section title="Children">
        <p>
          Wellbeing is intended for users 16 years or older. If you
          believe a minor has signed up, contact us and we will delete the
          account.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we materially change this policy, we will email all active
          users at least 14 days before the change takes effect.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions, requests, or complaints:{" "}
          <a href="mailto:hello@adityeah.ai">hello@adityeah.ai</a>.
        </p>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="font-serif text-xl text-sage mb-3">{title}</h2>
      <div className="text-[15px] leading-relaxed text-ink space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-sage [&_a]:underline">
        {children}
      </div>
    </section>
  );
}
