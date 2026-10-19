export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div>
      <p>{title}</p>
      <p className="text-[var(--text-muted)]">{description}</p>
    </div>
  )
}
