import { Check, Code2, Copy, Eye, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { type TranslationKey, useTranslation } from '../../../i18n'
import { useKBStore } from '../../../stores/kb-store'

interface SvgBlockProps {
  code: string
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 0.15

/**
 * Sanitize SVG markup so it is safe to inject via innerHTML.
 *
 * Strips:
 *   - `<script>` and `<foreignObject>` elements (can carry scripts / arbitrary HTML)
 *   - `on*` event handler attributes
 *   - `href` / `xlink:href` values starting with `javascript:`
 *
 * Uses DOMParser so malformed SVG is detected up-front (we surface the parser
 * error to the user instead of injecting broken markup).
 */
function sanitizeSvg(svg: string): {
  html: string
  error: { key: TranslationKey; detail: string | null } | null
} {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { html: '', error: { key: 'svg.domParserUnsupported', detail: null } }
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return { html: '', error: { key: 'svg.parseFailed', detail: parseError.textContent } }
  }
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    return { html: '', error: { key: 'svg.noSvgRoot', detail: null } }
  }
  for (const el of Array.from(root.querySelectorAll('script, foreignObject'))) {
    el.remove()
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const val = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
      } else if ((name === 'href' || name === 'xlink:href') && val.startsWith('javascript:')) {
        el.removeAttribute(attr.name)
      }
    }
  }
  return { html: root.outerHTML, error: null }
}

/**
 * SVG renderer with pan + zoom (mirrors MermaidBlock's UX).
 *
 *   - sanitized SVG injected via innerHTML (no async library)
 *   - inline preview/source toggle + copy
 *   - drag to pan, ctrl/meta + wheel to zoom
 *   - hover toolbar: zoom in/out, scale %, reset
 */
function SvgBlockImpl({ code }: SvgBlockProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef({ scale: 1, x: 0, y: 0 })
  const [showSource, setShowSource] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<{ key: TranslationKey; detail: string | null } | null>(null)
  const [svgHtml, setSvgHtml] = useState<string>('')
  const [scalePct, setScalePct] = useState(100)

  const trimmed = code.trim()
  const wrap = !!useKBStore((s) => s.settings?.codeBlockWordWrap)
  const sourceLines = trimmed.split('\n')
  const sourceLineCount = sourceLines.length
  const sourceGutterWidth = String(sourceLineCount).length

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

  // Sanitize + inject SVG markup whenever the source changes.
  useEffect(() => {
    if (showSource || !trimmed) {
      setSvgHtml('')
      setError(null)
      return
    }
    const { html, error: err } = sanitizeSvg(trimmed)
    if (err) {
      setError(err)
      setSvgHtml('')
    } else {
      setError(null)
      setSvgHtml(html)
    }
  }, [trimmed, showSource])
  // Apply transform + reset on each new SVG injection.
  useEffect(() => {
    if (showSource || error || !svgHtml) return
    transformRef.current = { scale: 1, x: 0, y: 0 }
    setScalePct(100)
    if (containerRef.current) {
      containerRef.current.innerHTML = svgHtml
      applyTransform()
    }
  }, [svgHtml, showSource, error, applyTransform])

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
      if (target.closest('[data-svg-toolbar]')) return
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

  const showToolbar = !showSource && !error && !!svgHtml

  return (
    <div className="group relative my-3 rounded-lg overflow-hidden border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-100">
        <span className="text-[11px] font-mono uppercase tracking-wide text-gray-500">svg</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-200"
            aria-label={showSource ? 'Show preview' : 'Show source'}
          >
            {showSource ? (
              <>
                <Eye className="w-3 h-3" />
                {t('common.preview')}
              </>
            ) : (
              <>
                <Code2 className="w-3 h-3" />
                {t('common.source')}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-200"
            aria-label="Copy source"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-600" />
                {t('markdown.codeCopied')}
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                {t('common.copy')}
              </>
            )}
          </button>
        </div>
      </div>

      {showSource ? (
        wrap ? (
          <div key="svg-source">
            {sourceLines.map((line, i) => {
              const isFirst = i === 0
              const isLast = i === sourceLineCount - 1
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are static and never reorder
                <div key={i + 1} className="flex">
                  <span
                    aria-hidden="true"
                    className={`shrink-0 select-none text-right pl-3 pr-2 text-[12.5px] leading-relaxed text-gray-400 bg-gray-100 border-r border-gray-200 ${
                      isFirst ? 'pt-2.5' : ''
                    } ${isLast ? 'pb-2.5' : ''}`}
                    style={{ minWidth: `${sourceGutterWidth + 0.5}ch`, fontFamily: 'monospace' }}
                  >
                    {i + 1}
                  </span>
                  <code
                    className={`flex-1 !p-0 !px-3 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words font-mono ${
                      isFirst ? '!pt-2.5' : ''
                    } ${isLast ? '!pb-2.5' : ''}`}
                  >
                    {line || '\u200B'}
                  </code>
                </div>
              )
            })}
          </div>
        ) : (
          <div key="svg-source" className="flex">
            <div
              aria-hidden="true"
              className="shrink-0 select-none text-right py-2.5 pl-3 pr-2 text-[12.5px] leading-relaxed text-gray-400 bg-gray-100 border-r border-gray-200"
              style={{ minWidth: `${sourceGutterWidth + 0.5}ch`, fontFamily: 'monospace' }}
            >
              {Array.from({ length: sourceLineCount }, (_, i) => {
                // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are static and never reorder
                return <div key={i + 1}>{i + 1}</div>
              })}
            </div>
            <pre className="!my-0 !bg-transparent flex-1 px-3 py-2.5 text-[12.5px] leading-relaxed overflow-x-auto">
              <code className="!p-0">{trimmed}</code>
            </pre>
          </div>
        )
      ) : error ? (
        <div
          key="svg-error"
          className="px-3 py-3 text-[12px] text-red-600 bg-red-50 border-t border-red-100"
        >
          <div className="font-medium mb-1">{t('svg.renderFailed')}</div>
          <div className="text-red-500 whitespace-pre-wrap break-all">
            {error.detail ?? t(error.key)}
          </div>
        </div>
      ) : (
        <div key="svg-preview" className="relative">
          <div
            ref={containerRef}
            className="svg-container relative px-4 py-4 overflow-hidden cursor-grab active:cursor-grabbing select-none min-h-[140px] flex justify-center [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:will-change-transform"
          />
          {showToolbar && (
            <div
              data-svg-toolbar
              className="absolute right-2 bottom-2 z-20 flex items-center rounded-md border border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            >
              <button
                type="button"
                onClick={zoomOut}
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-l-md"
                aria-label="Zoom out"
                title={t('common.zoomOut')}
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
                title={t('common.zoomIn')}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={resetTransform}
                className="inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-r-md border-l border-gray-200"
                aria-label="Reset view"
                title={t('common.reset')}
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

export const SvgBlock = memo(SvgBlockImpl)
