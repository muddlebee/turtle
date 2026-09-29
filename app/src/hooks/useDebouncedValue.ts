import { useEffect, useState } from 'react'

export const DEFAULT_DEBOUNCE_DELAY_MS = 300

export function scheduleDebouncedUpdate<T>(commit: (value: T) => void, value: T, delayMs: number) {
  const timeoutId = globalThis.setTimeout(() => commit(value), delayMs)
  return () => globalThis.clearTimeout(timeoutId)
}

export function useDebouncedValue<T>(value: T, delayMs = DEFAULT_DEBOUNCE_DELAY_MS): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => scheduleDebouncedUpdate(setDebouncedValue, value, delayMs), [value, delayMs])

  return debouncedValue
}
