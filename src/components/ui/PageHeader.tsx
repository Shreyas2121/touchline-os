export function PageHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <header>
      <h1>{title}</h1>
      {description ? (
        <p className="text-[var(--text-muted)]">{description}</p>
      ) : null}
    </header>
  )
}
