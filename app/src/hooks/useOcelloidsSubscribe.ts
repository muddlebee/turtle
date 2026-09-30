import { useCallback, useEffect, useRef } from 'react'
import useCompletedTransfers from '@/hooks/useCompletedTransfers'
import useNotification from '@/hooks/useNotification'
import useOngoingTransfers from '@/hooks/useOngoingTransfers'
import type { StoredTransfer } from '@/models/transfer'
import {
  getOcelloidsJourneys,
  getSubscribableTransfers,
  isTerminalJourney,
  journeyMatchesTransfer,
  type OcelloidsJourney,
  streamOcelloidsJourneys,
  updateTransferFromOcelloidsJourney,
} from '@/utils/ocelloids'

const useOcelloidsSubscribe = (ongoingTransfers: StoredTransfer[]) => {
  const { remove, updateStatus } = useOngoingTransfers()
  const { addCompletedTransfer } = useCompletedTransfers()
  const { addNotification } = useNotification()
  const transfersRef = useRef<StoredTransfer[]>([])
  const streamsRef = useRef(new Map<string, EventSource>())
  const pendingStreamsRef = useRef(new Set<string>())
  const queriedTransfersRef = useRef(new Set<string>())
  const settledTransfersRef = useRef(new Set<string>())
  const streamAddressesRef = useRef(new Set<string>())

  const xcmTransfers = getSubscribableTransfers(ongoingTransfers)

  const handleJourney = useCallback(
    (journey: OcelloidsJourney) => {
      const transfer = transfersRef.current.find(candidate => journeyMatchesTransfer(journey, candidate))
      if (!transfer) return
      if (isTerminalJourney(journey) && settledTransfersRef.current.has(transfer.id)) return

      const settled = updateTransferFromOcelloidsJourney(
        journey,
        transfer,
        remove,
        addCompletedTransfer,
        updateStatus,
        addNotification,
      )
      if (settled) settledTransfersRef.current.add(transfer.id)
    },
    [addCompletedTransfer, addNotification, remove, updateStatus],
  )

  useEffect(() => {
    transfersRef.current = xcmTransfers
    const activeIds = new Set(xcmTransfers.map(transfer => transfer.id))
    for (const id of settledTransfersRef.current) {
      if (!activeIds.has(id)) settledTransfersRef.current.delete(id)
    }
    for (const id of queriedTransfersRef.current) {
      if (!activeIds.has(id)) queriedTransfersRef.current.delete(id)
    }

    const addresses = new Set(xcmTransfers.map(transfer => transfer.sender))
    streamAddressesRef.current = addresses
    for (const [address, stream] of streamsRef.current) {
      if (!addresses.has(address)) {
        stream.close()
        streamsRef.current.delete(address)
      }
    }

    for (const address of addresses) {
      if (streamsRef.current.has(address) || pendingStreamsRef.current.has(address)) continue
      pendingStreamsRef.current.add(address)
      void streamOcelloidsJourneys(address, handleJourney)
        .then(stream => {
          pendingStreamsRef.current.delete(address)
          if (streamAddressesRef.current.has(address)) streamsRef.current.set(address, stream)
          else stream.close()
        })
        .catch(() => {
          pendingStreamsRef.current.delete(address)
        })
    }

    for (const transfer of xcmTransfers) {
      if (queriedTransfersRef.current.has(transfer.id)) continue
      queriedTransfersRef.current.add(transfer.id)
      void getOcelloidsJourneys(transfer).then(journeys => {
        for (const journey of journeys) handleJourney(journey)
      })
    }
  }, [handleJourney, xcmTransfers])

  useEffect(
    () => () => {
      streamAddressesRef.current = new Set()
      pendingStreamsRef.current.clear()
      queriedTransfersRef.current.clear()
      for (const stream of streamsRef.current.values()) stream.close()
      streamsRef.current.clear()
    },
    [],
  )
}

export default useOcelloidsSubscribe
