import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScmBusyOverlay } from './ScmBusyOverlay';

describe('ScmBusyOverlay', () => {
  it('renders nothing when inactive', () => {
    const html = renderToStaticMarkup(
      <ScmBusyOverlay active={false} message="Hidden message" />
    );
    expect(html).toBe('');
  });

  it('renders spinner and message when active', () => {
    const message = 'Creating branch in Bitbucket... This can take a few seconds.';
    const html = renderToStaticMarkup(<ScmBusyOverlay active message={message} />);
    expect(html).toContain(message);
    expect(html).toContain('animate-spin');
  });
});
