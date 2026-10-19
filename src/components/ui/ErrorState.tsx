export function ErrorState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="border border-[var(--block)] p-4">
      <h1>{title}</h1>
      <p className="text-[var(--text-muted)]">{description}</p>
    </div>
  )
}
