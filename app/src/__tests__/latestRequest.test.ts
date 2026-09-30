import { describe, expect, it } from 'vitest'
import { LatestRequest } from '@/utils/latestRequest'

describe('LatestRequest', () => {
  it('marks only the newest request as current', () => {
    const requests = new LatestRequest()
    const first = requests.start()
    const second = requests.start()

    expect(requests.isCurrent(first)).toBe(false)
    expect(requests.isCurrent(second)).toBe(true)
  })

  it('invalidates the active request when cancelled', () => {
    const requests = new LatestRequest()
    const active = requests.start()

    requests.cancel()

    expect(requests.isCurrent(active)).toBe(false)
  })
})
