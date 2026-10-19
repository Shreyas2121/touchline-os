export function CrestSvg({
  mark,
  primary,
  secondary,
  monogram,
  title,
}: {
  mark: 'shield' | 'stripe' | 'chevron' | 'monogram'
  primary: string
  secondary: string
  monogram: string
  title: string
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={64}
      height={64}
      role="img"
      aria-label={title}
      className="shrink-0"
    >
      <title>{title}</title>
      <rect x={4} y={4} width={56} height={56} rx={12} fill={primary} />
      <g fill={secondary}>
        {mark === 'shield' && (
          <path d="M16 12H48L46 38Q44 48 32 54Q20 48 18 38Z" />
        )}
        {mark === 'stripe' && <path d="M36 12H48L28 52H16Z" />}
        {mark === 'chevron' && (
          <path d="M12 34L32 14L52 34L44 42L32 30L20 42Z" />
        )}
        {mark === 'monogram' && (
          <text
            x={32}
            y={34}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="system-ui, sans-serif"
            fontSize={18}
            fontWeight={700}
          >
            {monogram}
          </text>
        )}
      </g>
    </svg>
  )
}
