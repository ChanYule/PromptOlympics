// Decorative, local artwork: no image requests or external fonts during an event.
export function StoryArt({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={`story-art ${compact ? "compact" : ""}`}
      viewBox="0 0 320 240"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="163" cy="125" r="96" fill="#e6eddf" />
      <circle cx="263" cy="57" r="17" fill="#f2c76b" />
      <path d="m38 169 16-7 7 16-16 7z" fill="#e99872" />
      <g transform="rotate(-9 157 121)">
        <rect x="92" y="43" width="146" height="176" rx="15" fill="#cad6c4" />
        <rect
          x="80"
          y="31"
          width="146"
          height="176"
          rx="15"
          fill="#fffdf7"
          stroke="#315d4d"
          strokeWidth="3"
        />
        <path
          d="M107 66h65M107 80h91"
          stroke="#b9c8b7"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M111 134c10 23 55 28 73-2"
          fill="none"
          stroke="#315d4d"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="120" cy="112" r="4" fill="#315d4d" />
        <circle cx="177" cy="112" r="4" fill="#315d4d" />
        <path
          d="M107 174h91M107 187h57"
          stroke="#b9c8b7"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <path
        d="m224 128 35-77 14 7-35 77-17 17z"
        fill="#f2c76b"
        stroke="#835721"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m221 152 4-19 12 5z" fill="#315d4d" />
      <path
        d="M56 66v22m-11-11h22M259 177v28m-14-14h28"
        stroke="#315d4d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="62" cy="120" r="4" fill="#e99872" />
    </svg>
  );
}
