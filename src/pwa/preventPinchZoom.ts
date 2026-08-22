// The viewport meta tag's user-scalable=no is only a request - several
// browsers (Samsung Internet confirmed by a user report; recent Safari and
// Chrome versions too, for some users) ignore it outright and always allow
// pinch and double-tap zoom, since blocking zoom is otherwise an
// accessibility regression (WCAG 1.4.4). This blocks the gestures directly
// instead, since the app is a fixed single-screen shell where zoom serves
// no purpose. It is a deliberate accessibility trade-off, not an oversight.
export function preventPinchZoom(): void {
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // Safari-only gesture events for pinch, fired independent of touchmove.
  document.addEventListener('gesturestart', (event) => event.preventDefault());
}
