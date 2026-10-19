import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({
  variant = 'quiet',
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: {
  variant?: 'primary' | 'quiet'
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const tone =
    variant === 'primary'
      ? 'bg-[var(--amber)] text-[var(--surface-0)]'
      : 'bg-transparent text-[var(--text-muted)]'

  return (
    <button
      type={type}
      disabled={disabled}
      {...rest}
      aria-disabled={disabled ? true : undefined}
      className={`touchline-focus px-3 py-1 disabled:opacity-60 ${tone} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}
