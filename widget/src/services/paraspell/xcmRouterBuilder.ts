import type { TransferParams } from '@/hooks/useTransfer'
import type { Dex } from '@/lib/paraspell/swap'
import { getParaSpellChain, getParaspellToken } from '@/lib/paraspell/transfer'
import type { SubstrateAccount } from '@/store/substrateWalletStore'
import { getSenderAddress } from '@/utils/address'
import { paraspellRpcOverrides } from '@/utils/consts'
import { toHuman } from '@/utils/transfer'

type RouterBuilderFactory = typeof import('@paraspell/xcm-router')['RouterBuilder']
type TxBuilder = ReturnType<RouterBuilderFactory>

type RouterParamsBase = Pick<TransferParams, 'sourceChain' | 'destinationChain' | 'sourceToken' | 'destinationToken'>

type RouterParamsWithSender = RouterParamsBase & Pick<TransferParams, 'sender' | 'recipient'>

type RouterParamsWithAmount = RouterParamsBase & {
  sourceAmount: bigint | string
}

type RouterParamsComplete = RouterParamsWithSender & {
  sourceAmount: bigint | string
}

export const MAX_CACHED_ROUTER_BUILDERS = 8

export class XcmRouterBuilderManager {
  private static instance: XcmRouterBuilderManager
  private builders: Map<string, TxBuilder>
  private buildersInFlight: Map<string, Promise<TxBuilder>>

  constructor(private readonly maxBuilders = MAX_CACHED_ROUTER_BUILDERS) {
    this.builders = new Map()
    this.buildersInFlight = new Map()
  }

  static getInstance(): XcmRouterBuilderManager {
    if (!XcmRouterBuilderManager.instance) {
      XcmRouterBuilderManager.instance = new XcmRouterBuilderManager()
    }
    return XcmRouterBuilderManager.instance
  }

  async createBuilder(params: TransferParams, exchange: Dex = 'HydrationDex'): Promise<TxBuilder> {
    const { sourceChain, destinationChain, sourceToken, destinationToken, sourceAmount } = params
    const sourceChainFromId = getParaSpellChain(sourceChain)
    const destinationChainFromId = getParaSpellChain(destinationChain)

    if (!sourceChainFromId || !destinationChainFromId) throw new Error('Transfer failed: chain id not found.')
    if (
      sourceChainFromId === 'Ethereum' ||
      sourceChainFromId === 'EthereumTestnet' ||
      destinationChainFromId === 'Ethereum' ||
      destinationChainFromId === 'EthereumTestnet'
    )
      throw new Error('Transfer failed: Ethereum is not supported.')

    const currencyIdFrom = getParaspellToken(sourceToken, sourceChainFromId)
    const currencyTo = getParaspellToken(destinationToken, destinationChainFromId)
    const key = txKey(params, exchange)

    const existingBuilder = this.getCachedBuilder(key)
    if (existingBuilder) return existingBuilder

    const existingBuilderPromise = this.buildersInFlight.get(key)
    if (existingBuilderPromise) return existingBuilderPromise

    const builderPromise = (async () => {
      const { RouterBuilder } = await import('@paraspell/xcm-router')
      const apiOverrides = {
        ...(sourceChain.rpcConnection && { [sourceChainFromId]: sourceChain.rpcConnection }),
        ...(destinationChain.rpcConnection && { [destinationChainFromId]: destinationChain.rpcConnection }),
        ...paraspellRpcOverrides,
      }
      return (
        RouterBuilder({
          ...(Object.keys(apiOverrides).length > 0 && { apiOverrides }),
          abstractDecimals: false,
        })
          .from(sourceChainFromId)
          .to(destinationChainFromId)
          // biome-ignore lint/suspicious/noExplicitAny: ParaSpell does not export the narrowed exchange type.
          .exchange(exchange as any)
          .currencyFrom(currencyIdFrom)
          .currencyTo(currencyTo)
          .amount(sourceAmount)
      )
    })()
    this.buildersInFlight.set(key, builderPromise)

    try {
      const builder = await builderPromise
      this.cacheBuilder(key, builder)
      return builder
    } catch (error) {
      console.error('Failed to create builder: ', error)
      throw error
    } finally {
      this.buildersInFlight.delete(key)
    }
  }

  async getBuilder(params: TransferParams, exchange: Dex): Promise<TxBuilder> {
    const key = txKey(params, exchange)
    const existing = this.getCachedBuilder(key)
    return existing ?? this.createBuilder(params, exchange)
  }

  private getCachedBuilder(key: string): TxBuilder | undefined {
    const builder = this.builders.get(key)
    if (!builder) return undefined

    this.builders.delete(key)
    this.builders.set(key, builder)
    return builder
  }

  private cacheBuilder(key: string, builder: TxBuilder) {
    while (this.builders.size >= this.maxBuilders) {
      const oldestKey = this.builders.keys().next().value
      if (!oldestKey) break
      this.builders.delete(oldestKey)
    }
    this.builders.set(key, builder)
  }

  async createRouterPlan(params: TransferParams, exchange: Dex = 'HydrationDex', slippagePct: string = '1') {
    try {
      const account = params.sender as SubstrateAccount
      const senderAddress = await getSenderAddress(params.sender)
      const recipientAddress = params.recipient
      // biome-ignore lint/suspicious/noExplicitAny: any
      const builder = (await this.getBuilder(params, exchange)) as any
      return await builder
        .slippagePct(slippagePct)
        .senderAddress(senderAddress)
        .recipientAddress(recipientAddress)
        // biome-ignore lint/suspicious/noExplicitAny: any
        .signer(account.pjsSigner as any)
        .buildTransactions()
    } catch (error) {
      console.error('Failed to create transfer tx: ', error)
      throw error
    }
  }

  async getExchangeOutputAmount(params: RouterParamsWithAmount, exchange: Dex = 'HydrationDex') {
    try {
      const builder = await this.getBuilder(params as TransferParams, exchange)
      // biome-ignore lint/suspicious/noExplicitAny: any
      const amountOut = await (builder as any).getBestAmountOut()
      return amountOut.amountOut
    } catch (error) {
      console.error('Failed to get best Amount Out: ', error)
      throw error
    }
  }

  // Max transferable amount
  async getTransferableAmount(params: RouterParamsComplete, exchange: Dex = 'HydrationDex') {
    try {
      const senderAddress = await getSenderAddress(params.sender)
      const recipientAddress = params.recipient
      const builder = await this.getBuilder(params as TransferParams, exchange)
      // biome-ignore lint/suspicious/noExplicitAny: any
      return await (builder as any)
        .senderAddress(senderAddress)
        .recipientAddress(recipientAddress)
        .getTransferableAmount()
    } catch (error) {
      console.error('Failed to get max transferable amount: ', error)
      throw error
    }
  }

  async getMinTransferableAmount(params: RouterParamsComplete, exchange: Dex = 'HydrationDex') {
    try {
      const senderAddress = await getSenderAddress(params.sender)
      const recipientAddress = params.recipient
      const builder = await this.getBuilder(params as TransferParams, exchange)
      // biome-ignore lint/suspicious/noExplicitAny: any
      return await (builder as any)
        .senderAddress(senderAddress)
        .recipientAddress(recipientAddress)
        .getMinTransferableAmount()
    } catch (error) {
      console.error('Failed to get min transferable amount: ', error)
      throw error
    }
  }

  // Origin and destination fees
  async getXcmFee(params: RouterParamsComplete, exchange: Dex = 'HydrationDex', slippagePct: string = '1') {
    try {
      const senderAddress = await getSenderAddress(params.sender)
      const recipientAddress = params.recipient
      // biome-ignore lint/suspicious/noExplicitAny: any
      const builder = (await this.getBuilder(params as TransferParams, exchange)) as any
      return await builder
        .slippagePct(slippagePct)
        .senderAddress(senderAddress)
        .recipientAddress(recipientAddress)
        .getXcmFees()
    } catch (error) {
      console.error('Failed to get xcm fees: ', error)
      throw error
    }
  }

  disconnect(params: TransferParams, exchange: Dex = 'HydrationDex') {
    this.removeBuilder(params, exchange)
    // TODO Router does not support .disconnect() yet but will be added in future updates
    return true
  }

  removeBuilder(params: TransferParams, exchange: Dex = 'HydrationDex') {
    const key = txKey(params, exchange)
    this.builders.delete(key)
  }

  builderList(): Map<string, TxBuilder> {
    return this.builders
  }
}

function txKey(params: TransferParams, exchange: Dex): string {
  const { sourceChain, destinationChain, sourceToken, destinationToken, sourceAmount } = params
  const amount = toHuman(sourceAmount, sourceToken) // Convert large numeric amount to human-readable format to prevent long key strings
  return [
    sourceChain.uid,
    destinationChain.uid,
    sourceToken.id,
    destinationToken.id,
    amount, // Source amount
    exchange,
  ].join('|')
}

const xcmRouterBuilderManager = XcmRouterBuilderManager.getInstance()
export default xcmRouterBuilderManager
