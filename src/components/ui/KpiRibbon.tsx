export function KpiRibbon({
  items,
}: {
  items: readonly { label: string; value: string }[]
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {items.map((item) => (
        <div key={item.label} className="col-span-3">
          <p className="text-[var(--text-muted)]">{item.label}</p>
          <p className="tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  )
}
