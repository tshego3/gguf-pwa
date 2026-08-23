import { useCallback, useEffect, useRef, useState } from 'react';

// How close to the bottom still counts as following the reply. A few
// pixels of slack absorbs sub-pixel rounding and the momentum overshoot
// iOS leaves behind, either of which would otherwise unpin a user who
// never scrolled at all.
const PIN_THRESHOLD_PX = 64;

// Pure, so the threshold is unit-testable without a layout engine.
export function isNearBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= PIN_THRESHOLD_PX;
}

export interface AutoScroll {
  // Goes on the scrolling element.
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  // Goes on the element that grows inside it.
  readonly contentRef: React.RefObject<HTMLDivElement | null>;
  readonly isPinned: boolean;
  readonly scrollToBottom: (behavior?: ScrollBehavior) => void;
}

// Keeps the transcript following the newest token, and stops the moment
// the user scrolls up to read back through the conversation.
//
// It watches the content box rather than React renders. A streamed token
// mutates the text of the last bubble without remounting anything, so an
// effect keyed on messages would miss almost all of them, and one keyed on
// the streaming buffer would fire per token - which the design rules
// forbid, because scrolling per token repaints the whole transcript and
// drops frames on a phone. A ResizeObserver plus one animation frame
// collapses a burst of tokens into a single scroll.
export function useAutoScroll(resetKey: string | null): AutoScroll {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  // Mirrors isPinned for the observer and scroll callbacks, which must not
  // re-subscribe every time it flips.
  const isPinnedRef = useRef(true);
  const frameRef = useRef<number | null>(null);

  const setPinned = useCallback((next: boolean) => {
    if (isPinnedRef.current === next) return;
    isPinnedRef.current = next;
    setIsPinned(next);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const container = containerRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior });
      setPinned(true);
    },
    [setPinned],
  );

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (!isPinnedRef.current || frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        container.scrollTop = container.scrollHeight;
      });
    });
    observer.observe(content);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  // Scrolling up is a deliberate act - reading back while a reply streams -
  // and the transcript must not yank itself down out from under it.
  // Returning to the bottom resumes following.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = (): void => {
      setPinned(isNearBottom(container.scrollHeight, container.scrollTop, container.clientHeight));
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [setPinned]);

  // A different conversation opens at its latest message, not at whatever
  // offset the previous one was left on.
  useEffect(() => {
    isPinnedRef.current = true;
    setIsPinned(true);
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [resetKey]);

  return { containerRef, contentRef, isPinned, scrollToBottom };
}
