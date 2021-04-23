declare module '@avocode/cancel-token' {
  import { AbortSignal } from 'abort-controller'

  export interface CancelToken {
    isCancelled(): boolean
    throwIfCancelled(): void
    onCancelled(listener: (reason: Error) => void): () => void
    signal: AbortSignal
  }

  interface TokenSource {
    (): {
      cancel: (reason?: Error | string) => void
      token: CancelToken
    }

    race(tokens: Array<CancelToken | null | undefined>): CancelToken
    fromSignal(signal: AbortSignal): { token: CancelToken, dispose: () => void }
    empty: CancelToken
  }

  const tokenSource: TokenSource
  export default tokenSource
}
