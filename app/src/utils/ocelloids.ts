import { captureException } from '@sentry/nextjs'
import { createCrosschainAgent, crosschainQueryApi, type sourceCrosschain } from '@sodazone/ocelloids-client'
import { type Notification, NotificationSeverity } from '@/models/notification'
import { type CompletedTransfer, type StoredTransfer, TxStatus } from '@/models/transfer'
import { Direction, resolveDirection } from '@/services/transfer'
import { updateTransferMetrics } from '@/utils/analytics'
import { getExplorerLink } from './explorers'
import { isSameChainSwap } from './transfer'

type ResultNotification = {
  message: string
  severity: NotificationSeverity
  status: TxStatus
}

export type OcelloidsJourney = sourceCrosschain.FullJourneyResponse

const crosschainAgent = createCrosschainAgent({})
const crosschainQuery = crosschainQueryApi(crosschainAgent)

// Keep provider-specific trackers isolated: Ocelloids owns only intra-Polkadot XCM.
export const getSubscribableTransfers = (transfers: StoredTransfer[]) =>
  transfers.filter(
    transfer =>
      resolveDirection(transfer.sourceChain, transfer.destChain) === Direction.WithinPolkadot &&
      !isSameChainSwap(transfer),
  )

export const getOcelloidsJourneys = async (transfer: StoredTransfer): Promise<OcelloidsJourney[]> => {
  try {
    return await crosschainQuery.journeysList({ txHash: transfer.id })
  } catch (error) {
    captureException(error, {
      tags: { provider: 'ocelloids', operation: 'journeys.list' },
      extra: { transferId: transfer.id },
    })
    return []
  }
}

export const streamOcelloidsJourneys = async (
  address: string,
  onJourney: (journey: OcelloidsJourney) => void,
): Promise<EventSource> => {
  try {
    return await crosschainAgent.stream(
      { streamName: 'default', args: { address } },
      {
        listeners: [
          { event: 'new_journey', onData: onJourney },
          { event: 'update_journey', onData: onJourney },
        ],
        onError: error => {
          // EventSource reconnects automatically. Record the degradation without creating a competing connection.
          captureException(error, { tags: { provider: 'ocelloids', operation: 'stream' }, extra: { address } })
        },
      },
    )
  } catch (error) {
    captureException(error, {
      tags: { provider: 'ocelloids', operation: 'stream.initialize' },
      extra: { address },
    })
    throw error
  }
}

export const journeyMatchesTransfer = (journey: OcelloidsJourney, transfer: StoredTransfer) =>
  journey.originTxPrimary === transfer.id || journey.originTxSecondary === transfer.id

export const isTerminalJourney = (journey: OcelloidsJourney) =>
  journey.status === 'received' || journey.status === 'failed' || journey.status === 'timeout'

export const updateTransferFromOcelloidsJourney = (
  journey: OcelloidsJourney,
  transfer: StoredTransfer,
  remove: (id: string) => void,
  addCompletedTransfer: (completedTransfer: CompletedTransfer) => void,
  updateStatus: (id: string) => void,
  addNotification: (notification: Omit<Notification, 'id'>) => void,
) => {
  if (journey.status === 'sent') {
    updateStatus(transfer.id)
    return false
  }

  const notification = getNotification(journey.status)
  if (!notification) return false

  const { status, message, severity } = notification
  const explorerLink = getExplorerLink(transfer)

  remove(transfer.id)
  addCompletedTransfer({
    id: transfer.id,
    result: status,
    sourceToken: transfer.sourceToken,
    destinationToken: transfer.destinationToken,
    sourceChain: transfer.sourceChain,
    destChain: transfer.destChain,
    sourceAmount: transfer.sourceAmount,
    destinationAmount: transfer.destinationAmount,
    sourceTokenUSDValue: transfer.sourceTokenUSDValue ?? 0,
    destinationTokenUSDValue: transfer.destinationTokenUSDValue,
    fees: transfer.fees,
    sender: transfer.sender,
    recipient: transfer.recipient,
    date: transfer.date,
    ...(explorerLink && { explorerLink }),
  } satisfies CompletedTransfer)

  addNotification({ message, severity, dismissible: true })
  updateTransferMetrics({ txHashId: transfer.id, status })

  if (status !== TxStatus.Succeeded) {
    captureException(new Error(`Ocelloids tracking error: ${message}`), {
      tags: { journeyStatus: journey.status },
      extra: { transfer, journey },
    })
  }

  return true
}

const getNotification = (journeyStatus: string): ResultNotification | undefined => {
  switch (journeyStatus) {
    case 'received':
      return {
        message: 'Transfer completed!',
        severity: NotificationSeverity.Success,
        status: TxStatus.Succeeded,
      }
    case 'failed':
      return {
        message: 'Transfer failed!',
        severity: NotificationSeverity.Error,
        status: TxStatus.Failed,
      }
    case 'timeout':
      return {
        message: 'Transfer timed out!',
        severity: NotificationSeverity.Warning,
        status: TxStatus.Undefined,
      }
    default:
      return undefined
  }
}
