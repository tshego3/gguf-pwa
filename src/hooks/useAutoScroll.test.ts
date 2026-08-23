import { describe, expect, it } from 'vitest';
import { isNearBottom } from './useAutoScroll';

describe('isNearBottom', () => {
  it('counts an exact bottom as following', () => {
    expect(isNearBottom(1000, 800, 200)).toBe(true);
  });

  // The slack exists for sub-pixel rounding and iOS momentum overshoot, not
  // as a convenience - without it a user who never scrolled gets unpinned.
  it('tolerates a small gap so rounding does not unpin a still user', () => {
    expect(isNearBottom(1000, 780, 200)).toBe(true);
    expect(isNearBottom(1000, 736, 200)).toBe(true);
  });

  it('treats a deliberate scroll up as not following', () => {
    expect(isNearBottom(1000, 735, 200)).toBe(false);
    expect(isNearBottom(1000, 0, 200)).toBe(false);
  });

  // A transcript shorter than its container has nothing to scroll, so it is
  // always at the bottom. Reporting otherwise would show a jump-to-latest
  // button on a two-message conversation.
  it('treats content shorter than the viewport as following', () => {
    expect(isNearBottom(200, 0, 600)).toBe(true);
  });
});
