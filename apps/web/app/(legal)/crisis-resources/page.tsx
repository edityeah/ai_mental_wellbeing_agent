export const metadata = { title: "Crisis Resources — Wellbeing" };

/**
 * Crisis resources page — public, no auth.
 * India-specific helplines, free, most 24×7. Source verified Jun 2026.
 */
export default function CrisisResourcesPage() {
  return (
    <article className="prose-article">
      <div className="bg-crisis/10 border-l-4 border-crisis rounded-r-lg px-4 py-4 mb-8">
        <p className="text-[15px] leading-relaxed">
          <strong>If you are in immediate danger</strong>, please call{" "}
          <strong>112</strong> — India&apos;s national emergency number.
          The helplines below are free, confidential, and most are
          available 24 hours a day.
        </p>
      </div>

      <h1 className="font-serif text-3xl text-sage mb-2">
        Crisis Resources — India
      </h1>
      <p className="text-sm text-mute mb-8">
        Trained human responders, free, confidential.
      </p>

      <div className="space-y-4">
        <Helpline
          name="KIRAN"
          subtitle="Government of India — National Mental Health Helpline"
          number="1800-599-0019"
          hours="24×7"
          notes="Free. Available in 13 Indian languages including Hindi, English, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese, Urdu."
        />
        <Helpline
          name="Vandrevala Foundation"
          subtitle="Mental health support, counsellor-staffed"
          number="1860-2662-345"
          alt="+91 9999 666 555"
          hours="24×7"
          notes="Toll-free landline; WhatsApp also available on the +91 number. English and Hindi."
        />
        <Helpline
          name="AASRA"
          subtitle="Suicide prevention, Mumbai-based, pan-India"
          number="+91 9820 466 726"
          hours="24×7"
          notes="Trained volunteers. Confidential. Calls and emails."
          email="aasrahelpline@yahoo.com"
        />
        <Helpline
          name="iCall"
          subtitle="TISS School of Human Ecology"
          number="+91 9152 987 821"
          hours="Mon–Sat, 8 AM – 10 PM"
          notes="Psychologist-led. Free counselling in 9 languages. Email support also available."
          email="icall@tiss.edu"
        />
        <Helpline
          name="NIMHANS Toll-Free"
          subtitle="National Institute of Mental Health, Bengaluru"
          number="080-46110007"
          hours="24×7"
          notes="Government-run. English and Indian languages."
        />
        <Helpline
          name="Sneha India"
          subtitle="Chennai-based, pan-India"
          number="044-24640050"
          hours="24×7"
          notes="Suicide prevention and emotional support."
          email="help@snehaindia.org"
        />
        <Helpline
          name="Connecting NGO"
          subtitle="Pune-based volunteer support"
          number="+91 9922 001122"
          alt="+91 9922 004305"
          hours="12 PM – 8 PM, all days"
          notes="Anonymous, confidential."
        />
      </div>

      <section className="mt-10">
        <h2 className="font-serif text-xl text-sage mb-3">
          What to expect when you call
        </h2>
        <ul className="text-[15px] leading-relaxed space-y-2 list-disc pl-6 text-ink">
          <li>
            A trained person — usually a counsellor or a trained
            volunteer, not an AI — will answer.
          </li>
          <li>
            You don&apos;t have to know what to say. &quot;I&apos;m
            struggling&quot; is enough to start.
          </li>
          <li>
            Calls are confidential. You don&apos;t have to give your real
            name unless you want to.
          </li>
          <li>It&apos;s free.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl text-sage mb-3">
          For someone you&apos;re worried about
        </h2>
        <p className="text-[15px] leading-relaxed text-ink">
          If a friend or family member is in crisis: stay with them, take
          them seriously, and help them connect to one of the numbers
          above. Remove access to means of self-harm if possible. You
          don&apos;t need to fix it — your presence is the help.
        </p>
      </section>
    </article>
  );
}

function Helpline({
  name,
  subtitle,
  number,
  alt,
  hours,
  notes,
  email,
}: {
  name: string;
  subtitle: string;
  number: string;
  alt?: string;
  hours: string;
  notes?: string;
  email?: string;
}) {
  const telHref = `tel:${number.replace(/[^+\d]/g, "")}`;
  return (
    <div className="bg-white border border-cream-edge rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-serif text-lg text-sage leading-tight">
            {name}
          </h3>
          <p className="text-xs text-mute mt-0.5">{subtitle}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wide bg-sage/10 text-sage px-2 py-1 rounded-full whitespace-nowrap">
          {hours}
        </span>
      </div>
      <div className="mt-3 space-y-1">
        <a
          href={telHref}
          className="block text-xl font-medium text-ink hover:text-sage transition"
        >
          {number}
        </a>
        {alt && (
          <a
            href={`tel:${alt.replace(/[^+\d]/g, "")}`}
            className="block text-sm text-mute hover:text-sage transition"
          >
            also: {alt}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="block text-sm text-mute hover:text-sage transition"
          >
            {email}
          </a>
        )}
      </div>
      {notes && (
        <p className="text-xs text-mute mt-2 leading-relaxed">{notes}</p>
      )}
    </div>
  );
}
