import { AssetHub, Polkadot, PolkadotTokens } from '@velocitylabs-org/turtle-registry'
import { describe, expect, it } from 'vitest'
import type { StoredTransfer } from '@/models/transfer'
import { isTerminalJourney, journeyMatchesTransfer, type OcelloidsJourney } from '@/utils/ocelloids'

const transfer: StoredTransfer = {
  id: '0xsource-transaction',
  sourceChain: Polkadot,
  destChain: AssetHub,
  sender: '14GkQUKj6TgX7EnbbgqiWLh8QziRFA7LCwSEhbZc9rLeSRJd',
  recipient: '14GkQUKj6TgX7EnbbgqiWLh8QziRFA7LCwSEhbZc9rLeSRJd',
  sourceToken: PolkadotTokens.DOT,
  destinationToken: PolkadotTokens.DOT,
  sourceAmount: '1',
  destinationAmount: '1',
  fees: [],
  date: new Date('2026-01-01T00:00:00.000Z'),
}

const journey = (status: string, originTxPrimary = transfer.id): OcelloidsJourney => ({
  id: 1,
  correlationId: '0xcorrelation',
  status,
  type: 'transfer',
  originProtocol: 'xcm',
  destinationProtocol: 'xcm',
  origin: 'urn:ocn:polkadot:0',
  destination: 'urn:ocn:polkadot:1000',
  from: transfer.sender,
  to: transfer.recipient,
  createdAt: 0,
  stops: '[]',
  instructions: '[]',
  transactCalls: '[]',
  originTxPrimary,
  totalUsd: 0,
  assets: [],
})

describe('Ocelloids crosschain journey tracking', () => {
  it.each(['received', 'failed', 'timeout'])('treats %s as terminal', status => {
    expect(isTerminalJourney(journey(status))).toBe(true)
  })

  it.each(['sent', 'waiting', 'unknown'])('keeps %s journey updates active', status => {
    expect(isTerminalJourney(journey(status))).toBe(false)
  })

  it('matches both native and EVM origin transaction hashes', () => {
    expect(journeyMatchesTransfer(journey('received'), transfer)).toBe(true)
    expect(
      journeyMatchesTransfer({ ...journey('received', '0xother'), originTxSecondary: transfer.id }, transfer),
    ).toBe(true)
  })

  it('does not complete a journey for a different transfer', () => {
    expect(journeyMatchesTransfer(journey('received', '0xother'), transfer)).toBe(false)
  })
})
