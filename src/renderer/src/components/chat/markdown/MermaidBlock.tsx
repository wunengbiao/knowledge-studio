import { Check, Code2, Copy, Eye, Loader2, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

interface MermaidBlockProps {
  code: string
}

// Mermaid module singleton — lazy loaded on first render (mirrors cherry-studio's pattern).
// biome-ignore lint/suspicious/noExplicitAny: dynamic import shape
let mermaidModule: any = null
// biome-ignore lint/suspicious/noExplicitAny: dynamic import shape
let mermaidLoadPromise: Promise<any> | null = null

// biome-ignore lint/suspicious/noExplicitAny: dynamic import shape
async function loadMermaid(): Promise<any> {
  if (mermaidModule) return mermaidModule
  if (mermaidLoadPromise) return mermaidLoadPromise
  mermaidLoadPromise = import('mermaid').then((mod) => {
    const m = mod.default || mod
    m.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    })
    mermaidModule = m
    return m
  })
  return mermaidLoadPromise
}

let renderSeq = 0

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 0.15

/**
 * Mermaid diagram renderer with pan + zoom (cherry-studio's MermaidPreview pattern).
 *
 *   - lazy singleton mermaid module
 *   - inline preview/source toggle + copy
 *   - drag to pan, ctrl/meta + wheel to zoom
 *   - hover toolbar: zoom in/out, scale %, reset
 */
function MermaidBlockImpl({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef({ scale: 1, x: 0, y: 0 })
  const [showSource, setShowSource] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scalePct, setScalePct] = useState(100)
  const renderIdRef = useRef(`mermaid-${++renderSeq}`)

  const trimmed = code.trim()

  const getSvg = useCallback(
    (): SVGElement | null => containerRef.current?.querySelector('svg') ?? null,
    []
  )

  const applyTransform = useCallback(() => {
    const svg = getSvg()
    if (!svg) return
    const { x, y, scale } = transformRef.current
    svg.style.transformOrigin = 'top left'
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }, [getSvg])

  const setScale = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
      transformRef.current.scale = clamped
      setScalePct(Math.round(clamped * 100))
      applyTransform()
    },
    [applyTransform]
  )

  const zoomIn = useCallback(() => setScale(transformRef.current.scale + ZOOM_STEP), [setScale])
  const zoomOut = useCallback(() => setScale(transformRef.current.scale - ZOOM_STEP), [setScale])

  const resetTransform = useCallback(() => {
    transformRef.current = { scale: 1, x: 0, y: 0 }
    setScalePct(100)
    applyTransform()
  }, [applyTransform])

  useEffect(() => {
    if (showSource || !trimmed) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const mermaid = await loadMermaid()
        await mermaid.parse(trimmed)
        const { svg } = await mermaid.render(renderIdRef.current, trimmed)
        if (cancelled) return
        const fixed = svg.replace(/translate\(undefined,\s*NaN\)/g, 'translate(0, 0)')
        if (containerRef.current) {
          containerRef.current.innerHTML = fixed
          transformRef.current = { scale: 1, x: 0, y: 0 }
          setScalePct(100)
          applyTransform()
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [trimmed, showSource, applyTransform])

  // drag-pan
  useEffect(() => {
    if (showSource || error) return
    const container = containerRef.current
    if (!container) return

    const startPos = { x: 0, y: 0 }
    const startTrans = { x: 0, y: 0 }

    const onMouseMove = (e: MouseEvent) => {
      transformRef.current.x = startTrans.x + (e.clientX - startPos.x)
      transformRef.current.y = startTrans.y + (e.clientY - startPos.y)
      applyTransform()
      e.preventDefault()
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      container.style.cursor = ''
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('[data-mermaid-toolbar]')) return
      startPos.x = e.clientX
      startPos.y = e.clientY
      startTrans.x = transformRef.current.x
      startTrans.y = transformRef.current.y
      container.style.cursor = 'grabbing'
      e.preventDefault()
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }

    container.addEventListener('mousedown', onMouseDown)
    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [showSource, error, applyTransform])

  // ctrl/meta + wheel zoom
  useEffect(() => {
    if (showSource || error) return
    const container = containerRef.current
    if (!container) return

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      setScale(transformRef.current.scale + delta)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [showSource, error, setScale])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trimmed)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }, [trimmed])

  const showToolbar = !showSource && !error && !loading

  return (
    <div className="group relative my-3 rounded-lg overflow-hidden border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-100/70">
        <span className="text-[11px] font-mono uppercase tracking-wide text-gray-500">mermaid</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-200/60"
            aria-label={showSource ? 'Show preview' : 'Show source'}
          >
            {showSource ? (
              <>
                <Eye className="w-3 h-3" />
                预览
              </>
            ) : (
              <>
                <Code2 className="w-3 h-3" />
                源码
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-200/60"
            aria-label="Copy source"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-600" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                复制
              </>
            )}
          </button>
        </div>
      </div>

      {showSource ? (
        <pre className="!my-0 !bg-transparent overflow-x-auto px-3 py-2.5 text-[12.5px] leading-relaxed">
          <code>{trimmed}</code>
        </pre>
      ) : error ? (
        <div className="px-3 py-3 text-[12px] text-red-600 bg-red-50 border-t border-red-100">
          <div className="font-medium mb-1">Mermaid 渲染失败</div>
          <div className="text-red-500 whitespace-pre-wrap break-all">{error}</div>
        </div>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 text-xs text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              渲染中...
            </div>
          )}
          <div
            ref={containerRef}
            className="mermaid-container relative px-4 py-4 overflow-hidden cursor-grab active:cursor-grabbing select-none min-h-[140px] flex justify-center [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:will-change-transform"
          />
          {showToolbar && (
            <div
              data-mermaid-toolbar
              className="absolute right-2 bottom-2 z-20 flex items-center rounded-md border border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            >
              <button
                type="button"
                onClick={zoomOut}
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-l-md"
                aria-label="Zoom out"
                title="缩小"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span
                className="text-[11px] tabular-nums font-mono text-gray-500 min-w-[40px] text-center select-none px-1"
                aria-live="polite"
              >
                {scalePct}%
              </span>
              <button
                type="button"
                onClick={zoomIn}
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Zoom in"
                title="放大"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={resetTransform}
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-r-md border-l border-gray-200"
                aria-label="Reset view"
                title="重置 (100%)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const MermaidBlock = memo(MermaidBlockImpl)
