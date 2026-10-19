import { Ban, CircleCheck, Info, TriangleAlert } from 'lucide-react'

const tones = {
  blocked: { word: 'Blocked', icon: Ban, color: 'var(--block)' },
  warning: { word: 'Warning', icon: TriangleAlert, color: 'var(--amber)' },
  informational: { word: 'Informational', icon: Info, color: 'var(--teal)' },
  passed: { word: 'Passed', icon: CircleCheck, color: 'var(--teal)' },
} as const

export function StatusPill({ tone }: { tone: keyof typeof tones }) {
  const item = tones[tone]
  const Icon = item.icon

  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ color: item.color }}
    >
      <Icon aria-hidden="true" size={16} />
      {item.word}
    </span>
  )
}
