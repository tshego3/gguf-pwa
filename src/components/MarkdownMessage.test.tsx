import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownMessage } from './MarkdownMessage';

afterEach(cleanup);

describe('MarkdownMessage', () => {
  it('renders a script tag as inert text, never as executable markup', () => {
    const { container } = render(<MarkdownMessage content="<script>window.__xss = true</script>" />);
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it('strips an inline event handler attribute from otherwise-valid markdown', () => {
    const { container } = render(<MarkdownMessage content='<img src="x" onerror="window.__xss = true">' />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull();
  });

  it('still renders safe markdown - code fences, emphasis, lists', () => {
    const { container } = render(<MarkdownMessage content={'# Title\n\n**bold** and `code`\n\n- one\n- two'} />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});
