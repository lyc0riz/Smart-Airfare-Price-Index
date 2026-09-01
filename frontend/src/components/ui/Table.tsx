import { TableHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface Column<T> {
  key: string
  header: string
  accessor: (row: T, index: number) => ReactNode
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
}

export interface TableProps<T> extends TableHTMLAttributes<HTMLTableElement> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  onSort?: (key: string, direction: 'asc' | 'desc') => void
  sortKey?: string
  sortDirection?: 'asc' | 'desc'
  striped?: boolean
  hoverable?: boolean
  emptyMessage?: string
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onSort,
  sortKey,
  sortDirection,
  striped = true,
  hoverable = true,
  emptyMessage = 'No data available',
  className,
  ...props
}: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-sm border border-border', className)}>
      <table className="w-full min-w-[600px] border-collapse" {...props}>
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  col.sortable
                    ? sortKey === col.key
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
                className={cn(
                  'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground',
                  col.align === 'center' && 'text-center',
                  col.align === 'right' && 'text-right'
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => onSort?.(col.key, sortKey === col.key && sortDirection === 'asc' ? 'desc' : 'asc')}
                    className="inline-flex cursor-pointer select-none items-center gap-1 hover:text-foreground"
                  >
                    {col.header}
                    {sortKey === col.key &&
                      (sortDirection === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn('divide-y divide-border', striped && 'bg-background')}>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={keyExtractor(row)}
                className={cn(
                  'transition-colors',
                  hoverable && 'hover:bg-accent/50',
                  striped && rowIndex % 2 === 1 && 'bg-muted/30'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-sm',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right'
                    )}
                  >
                    {col.accessor(row, rowIndex)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}