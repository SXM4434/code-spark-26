type MascotProps = {
  size?: number;
  mood?: "happy" | "thinking" | "wave" | "wink";
  className?: string;
};

/** Cartoonist — a friendly hand-drawn doodle creature. Inline SVG so it scales and themes. */
export function Mascot({ size = 120, mood = "happy", className = "" }: MascotProps) {
  const eyeRight =
    mood === "wink" ? (
      <path d="M68 50 Q72 52 76 50" stroke="#2B2B2B" strokeWidth="3" fill="none" strokeLinecap="round" />
    ) : (
      <circle cx="72" cy="50" r="3.5" fill="#2B2B2B" />
    );
  const mouth =
    mood === "thinking" ? (
      <path d="M44 66 Q52 62 60 66" stroke="#2B2B2B" strokeWidth="3" fill="none" strokeLinecap="round" />
    ) : mood === "wave" ? (
      <path d="M42 64 Q52 76 62 64" stroke="#2B2B2B" strokeWidth="3" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M40 62 Q52 74 64 62" stroke="#2B2B2B" strokeWidth="3" fill="none" strokeLinecap="round" />
    );

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* squiggle behind */}
      <path
        d="M10 100 Q30 90 50 100 T90 100 T118 96"
        stroke="#FFD166"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* body blob */}
      <path
        d="M22 60 C20 32, 50 18, 64 22 C90 26, 102 50, 96 72 C90 96, 60 104, 42 96 C24 88, 24 78, 22 60 Z"
        fill="#FF6B4A"
        stroke="#2B2B2B"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* cheek blush */}
      <ellipse cx="36" cy="68" rx="6" ry="3.5" fill="#9B5DE5" opacity="0.45" />
      <ellipse cx="82" cy="68" rx="6" ry="3.5" fill="#9B5DE5" opacity="0.45" />
      {/* eyes */}
      <circle cx="46" cy="50" r="3.5" fill="#2B2B2B" />
      {eyeRight}
      {/* mouth */}
      {mouth}
      {/* little antenna pen */}
      <line x1="60" y1="22" x2="60" y2="8" stroke="#2B2B2B" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="6" r="4" fill="#2EC4B6" stroke="#2B2B2B" strokeWidth="2" />
      {/* hand wave */}
      {mood === "wave" && (
        <g>
          <path
            d="M100 40 q8 -4 10 -12"
            stroke="#2B2B2B"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="110" cy="26" r="5" fill="#FFD166" stroke="#2B2B2B" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}
