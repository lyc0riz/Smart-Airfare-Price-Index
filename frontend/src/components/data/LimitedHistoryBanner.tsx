import { AlertTriangle } from 'lucide-react'

export function LimitedHistoryBanner({
  warning,
  onDismiss,
}: {
  warning?: string
  onDismiss?: () => void
}) {
  if (!warning) return null

  return (
    <div
      role="status"
      className="mb-4 flex items-start justify-between gap-3 rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-medium">Limited live dataset</p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-300">{warning}</p>
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium text-amber-800 underline hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100"
        >
          Dismiss
        </button>
      )}
    </div>
  )
}
