// Ambient shapes for the browser-side bundle: DSH loads client plugins through its
// own module loader, and React is supplied by the browser module table.

declare module 'react' {
  class Component<P = any, S = any> {
    constructor(props: P)
    props: P
    state: S
  }
  const React: {
    Component: typeof Component
    createElement: (...args: any[]) => any
    useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void]
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void
    useCallback: <T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]) => T
    useMemo: <T>(fn: () => T) => T
    useRef: <T>(value: T) => { current: T }
  }
  export = React
}

/** QR binding progress reported by the host's bind.start / bind.state endpoints. */
interface BindState {
  phase: string
  qrSvg?: string
  url?: string
  reason?: string
}

interface Window {
  __ModuleLoader__: {
    load(module: { id: string; factory: (require: (id: string) => any) => any }): void
  }
}
