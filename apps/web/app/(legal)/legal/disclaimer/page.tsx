export const metadata = { title: "Disclaimer — Wellbeing" };

export default function DisclaimerPage() {
  return (
    <article className="prose-article">
      <h1 className="font-serif text-3xl text-sage mb-3">
        Important Disclaimer
      </h1>
      <p className="text-[15px] text-ink mb-8 leading-relaxed">
        Please read this carefully before using Wellbeing. It explains
        what the Companion can — and cannot — do for you.
      </p>

      <CalloutWarning>
        <p>
          <strong>If you are in danger or in crisis right now</strong>,
          please don&apos;t wait. Call <strong>112</strong> for emergency
          services in India, or one of the helplines on our{" "}
          <a href="/crisis-resources" className="text-sage underline">
            Crisis Resources
          </a>{" "}
          page. Some of them are 24×7 and free.
        </p>
      </CalloutWarning>

      <Section title="Not medical advice">
        <p>
          Wellbeing is a software companion for self-reflection and
          general emotional support. It is <strong>not</strong>:
        </p>
        <ul>
          <li>A medical device or a clinical diagnostic tool.</li>
          <li>
            A licensed therapist, counsellor, psychiatrist, or doctor.
          </li>
          <li>A substitute for any kind of professional care.</li>
        </ul>
        <p>
          The Companion does not diagnose, treat, cure, or prevent any
          mental health condition. Suggestions it offers are general
          ideas, not prescriptions.
        </p>
      </Section>

      <Section title="Not for emergencies">
        <p>
          If you are experiencing thoughts of self-harm, suicide, abuse,
          or a psychiatric emergency:
        </p>
        <ul>
          <li>
            <strong>Do not rely on this app.</strong> The Companion is a
            language model — it may be slow, unavailable, or misjudge
            severity.
          </li>
          <li>
            Call <strong>112</strong> (India emergency), or speak directly
            to one of the trained human responders on our{" "}
            <a href="/crisis-resources" className="text-sage underline">
              Crisis Resources
            </a>{" "}
            page.
          </li>
          <li>
            If someone you know is in immediate danger, get them to a
            person, not to a screen.
          </li>
        </ul>
      </Section>

      <Section title="AI has limits">
        <p>
          The Companion is powered by a large language model. It can:
        </p>
        <ul>
          <li>
            Misunderstand what you said, especially in voice when there&apos;s
            background noise.
          </li>
          <li>
            Sound confident while being wrong, especially about facts,
            medical claims, or specific people.
          </li>
          <li>
            Miss important context that a human therapist would naturally
            catch.
          </li>
        </ul>
        <p>
          Use it as one input to your own thinking, not the final word.
        </p>
      </Section>

      <Section title="Your information">
        <p>
          What you tell the Companion is stored in our database so the
          Companion can remember context across sessions. See the{" "}
          <a href="/legal/privacy" className="text-sage underline">
            Privacy Policy
          </a>{" "}
          for full detail. If you don&apos;t want something stored, please
          don&apos;t share it.
        </p>
      </Section>

      <Section title="When to talk to a human professional">
        <p>Please consider seeking professional support if you experience:</p>
        <ul>
          <li>
            Persistent low mood, anxiety, or hopelessness lasting more
            than two weeks.
          </li>
          <li>Significant disruption to sleep, appetite, or work.</li>
          <li>
            Thoughts of harming yourself or others, no matter how
            fleeting.
          </li>
          <li>
            Substance use that&apos;s started feeling out of your
            control.
          </li>
          <li>A specific event (loss, trauma, diagnosis) you can&apos;t process alone.</li>
        </ul>
        <p>
          A directory of options:{" "}
          <a
            className="text-sage underline"
            href="https://www.mohfw.gov.in"
            target="_blank"
            rel="noreferrer"
          >
            Ministry of Health &amp; Family Welfare
          </a>
          ,{" "}
          <a
            className="text-sage underline"
            href="https://nimhans.ac.in"
            target="_blank"
            rel="noreferrer"
          >
            NIMHANS
          </a>
          , or a GP referral.
        </p>
      </Section>

      <Section title="By continuing">
        <p>
          By continuing to use Wellbeing, you confirm you have read and
          understood this disclaimer. If anything here doesn&apos;t sit
          right with you, please contact us at{" "}
          <a
            href="mailto:hello@adityeah.ai"
            className="text-sage underline"
          >
            hello@adityeah.ai
          </a>{" "}
          before continuing.
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
      <div className="text-[15px] leading-relaxed text-ink space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

function CalloutWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-crisis/10 border-l-4 border-crisis rounded-r-lg px-4 py-3 mb-8 text-[15px] leading-relaxed">
      {children}
    </div>
  );
}
