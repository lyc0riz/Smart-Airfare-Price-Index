import { AlertCircle, RefreshCw } from 'lucide-react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'

interface PageErrorProps {
  error: Error | null
  onRetry: () => void
  title?: string
}

export function PageError({ error, onRetry, title = 'Something went wrong' }: PageErrorProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8" role="alert">
      <Card className="w-full max-w-md text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error?.message ? String(error.message) : 'An unexpected error occurred while rendering this page.'}
        </p>
        <Button className="mt-6" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </Card>
    </div>
  )
}