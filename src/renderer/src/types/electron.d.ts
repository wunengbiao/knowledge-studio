export {}

declare global {
  interface Window {
    electronAPI: {
      invoke: <C extends string>(channel: C, ...args: any[]) => Promise<any>
      on: <C extends string>(channel: C, callback: (data: any) => void) => () => void
    }
  }
}
