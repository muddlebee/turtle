import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleDebouncedUpdate } from '@/hooks/useDebouncedValue'

describe('scheduleDebouncedUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('commits only the latest value after the debounce interval', () => {
    const commit = vi.fn()

    const cancelFirstUpdate = scheduleDebouncedUpdate(commit, 1n, 300)
    cancelFirstUpdate()
    scheduleDebouncedUpdate(commit, 11n, 300)

    vi.advanceTimersByTime(299)
    expect(commit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledWith(11n)
  })
})
