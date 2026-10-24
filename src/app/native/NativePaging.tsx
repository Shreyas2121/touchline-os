import { Button } from '../../components/ui/Button'

export function Paging({
  page,
  total,
  onPage,
  label = 'Pagination',
}: {
  page: number
  total: number
  onPage: (page: number) => void
  label?: string
}) {
  return (
    <nav aria-label={label} className="flex gap-3">
      <Button disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous page
      </Button>
      <span>
        Page {page + 1} · {total} records
      </span>
      <Button
        disabled={(page + 1) * 50 >= total}
        onClick={() => onPage(page + 1)}
      >
        Next page
      </Button>
    </nav>
  )
}
