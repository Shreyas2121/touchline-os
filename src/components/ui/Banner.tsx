import type { ReactNode } from 'react'

export function Banner({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2"
    >
      {children}
    </div>
  )
}
