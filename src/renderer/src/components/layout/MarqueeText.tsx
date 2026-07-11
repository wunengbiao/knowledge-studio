import { useEffect, useRef } from 'react'

interface MarqueeTextProps {
  /** Text to display. When it overflows and `playing` is true, it scrolls. */
  text: string
  /** Whether the scroll animation should be playing. Typically tied to row hover. */
  playing: boolean
  /** Optional extra className for the overflow container. */
  className?: string
  /** Scroll speed in pixels per second. Default 40. */
  speed?: number
  /** Pause duration at the start (before scrolling begins), in ms. Default 800. */
  startPauseMs?: number
  /** Pause duration at the end of each scroll, in ms. Default 2000. */
  pauseMs?: number
}

/**
 * Single-line text that scrolls horizontally to reveal overflow content.
 *
 * Behavior: when `playing` is true and the text overflows its container, the
 * text translates left (so the truncated right end becomes visible), holds at
 * the end for `pauseMs`, then snaps back to the start and repeats. When
 * `playing` is false, the animation is cancelled and the text rests at its
 * natural left-aligned position.
 *
 * "Left to right" = reading direction: the start is shown first, then the
 * scroll reveals the rest toward the right end.
 *
 * Respects `prefers-reduced-motion`: when reduced motion is requested, the
 * component never animates (text stays truncated).
 *
 * Uses the Web Animations API so the end pause is exact (2s by default)
 * independent of the overflow distance, and the scroll speed stays consistent
 * across items of different lengths.
 */
export function MarqueeText({
  text,
  playing,
  className,
  speed = 40,
  startPauseMs = 800,
  pauseMs = 2000
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const animationRef = useRef<Animation | null>(null)
  const playingRef = useRef(playing)

  // Keep playingRef in sync so the build effect (which doesn't depend on
  // `playing`) can apply the correct state when text/size changes.
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // (Re)build the animation when text or container size changes.
  useEffect(() => {
    const container = containerRef.current
    const textEl = textRef.current
    if (!container || !textEl) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const build = () => {
      // Cancel previous animation (if any).
      animationRef.current?.cancel()
      animationRef.current = null

      const overflow = textEl.scrollWidth - container.clientWidth
      if (overflow <= 0 || prefersReducedMotion) return

      const scrollTime = Math.max(600, (overflow / speed) * 1000)
      const totalTime = startPauseMs + scrollTime + pauseMs
      const startPauseEnd = startPauseMs / totalTime
      const endOffset = (startPauseMs + scrollTime) / totalTime

      const anim = textEl.animate(
        [
          { transform: 'translateX(0px)' },
          { transform: 'translateX(0px)', offset: startPauseEnd },
          { transform: `translateX(${-overflow}px)`, offset: endOffset },
          { transform: `translateX(${-overflow}px)` }
        ],
        {
          duration: totalTime,
          iterations: Number.POSITIVE_INFINITY,
          easing: 'linear'
        }
      )
      // Start in idle state so the text rests at its natural position.
      anim.cancel()
      animationRef.current = anim

      if (playingRef.current) {
        anim.play()
      }
    }

    build()

    const ro = new ResizeObserver(build)
    ro.observe(container)
    ro.observe(textEl)
    return () => {
      ro.disconnect()
      animationRef.current?.cancel()
      animationRef.current = null
    }
  }, [speed, startPauseMs, pauseMs])

  // Play / cancel based on the `playing` prop.
  useEffect(() => {
    const anim = animationRef.current
    if (!anim) return
    if (playing) {
      // Animation is idle (cancelled) when not playing, so play() restarts
      // from the beginning.
      anim.play()
    } else {
      anim.cancel()
    }
  }, [playing])

  return (
    <div
      ref={containerRef}
      className={
        className
          ? `overflow-hidden whitespace-nowrap ${className}`
          : 'overflow-hidden whitespace-nowrap'
      }
    >
      <span ref={textRef} className="inline-block will-change-transform">
        {text}
      </span>
    </div>
  )
}
