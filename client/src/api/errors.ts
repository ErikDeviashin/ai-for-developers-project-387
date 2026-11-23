import type { ErrorResponse } from './generated'

export function toErrorResponse(error: unknown): ErrorResponse | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  ) {
    return error as ErrorResponse
  }

  return undefined
}

export function fieldErrorsFrom(error: ErrorResponse): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const detail of error.details ?? []) {
    errors[detail.field] = detail.message
  }

  return errors
}
