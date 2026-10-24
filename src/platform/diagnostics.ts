export type Diagnostic = {
  correlationId: string
  operation: string
  category: string
  cause: unknown
}

export type DiagnosticSink = (event: Diagnostic) => void

// Arbitrary messages and stacks can contain saved content and file paths.
let sink: DiagnosticSink = ({ correlationId, operation, category }) => {
  console.error('[touchline diagnostic]', {
    correlationId,
    operation,
    category,
  })
}
let sequence = 0

export function setDiagnosticSink(next: DiagnosticSink): () => void {
  const previous = sink
  sink = next
  return () => {
    sink = previous
  }
}

export function reportDiagnostic(
  operation: string,
  category: string,
  cause: unknown,
): void {
  try {
    sink({
      correlationId: `browser-${Date.now()}-${++sequence}`,
      operation,
      category,
      cause,
    })
  } catch {
    // A diagnostic sink must not change public command behavior.
  }
}
