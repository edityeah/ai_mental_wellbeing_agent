/**
 * Wellbeing brand mark.
 *
 * A soft sage circle holding a single curved leaf — minimal, calm,
 * recognizable at any size. Replaces the 🍃 emoji used across the app
 * during early development.
 *
 * Use <LogoMark /> for icon-only contexts (avatars, favicons, app
 * installer). Use <Logomark size={...} /> with an inline label for
 * headers and the login screen.
 */

export function LogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Wellbeing"
    >
      <defs>
        <linearGradient id="wb-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5C7060" />
          <stop offset="1" stopColor="#3A4D3F" />
        </linearGradient>
        <linearGradient id="wb-leaf" x1="20" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FAF7F2" />
          <stop offset="1" stopColor="#E7E2D6" />
        </linearGradient>
      </defs>
      {/* rounded square plate (instead of perfect circle — more modern) */}
      <rect width="64" height="64" rx="16" fill="url(#wb-bg)" />
      {/* a single curved leaf, stem at the bottom-left, tip top-right */}
      <path
        d="M18 46 C 18 28, 30 16, 48 16 C 48 34, 36 46, 18 46 Z"
        fill="url(#wb-leaf)"
      />
      {/* central vein */}
      <path
        d="M20 44 C 28 36, 36 28, 46 18"
        stroke="#5C7060"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function LogoWordmark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} />
      <span className="font-serif text-sage" style={{ fontSize: size * 0.7 }}>
        Wellbeing
      </span>
    </span>
  );
}
