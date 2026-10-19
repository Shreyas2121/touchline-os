export function PitchSvg({
  paths,
}: {
  paths: readonly { id: string; d: string }[]
}) {
  return (
    <svg
      viewBox="0 0 680 1050"
      role="img"
      aria-label="Pitch"
      className="block h-auto w-full max-w-[34rem] rounded-lg bg-[var(--surface-1)] text-[var(--text-muted)]"
    >
      <title>Pitch</title>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
      >
        {paths.map((path) => (
          <path key={path.id} id={path.id} d={path.d} />
        ))}
      </g>
    </svg>
  )
}
