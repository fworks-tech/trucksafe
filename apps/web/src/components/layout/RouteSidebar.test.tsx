import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test/render';
import { RouteSidebar } from './RouteSidebar';

function renderSheet(): void {
  renderWithProviders(
    <RouteSidebar header={<div>Sheet tabs</div>}>
      <div>Sheet body content</div>
    </RouteSidebar>,
  );
}

describe('RouteSidebar mobile snaps', () => {
  it('cycles half, expanded, and collapsed without clipping content', async () => {
    const user = userEvent.setup();
    renderSheet();

    // Default snap is half: header and body both visible.
    expect(screen.getByText('Sheet tabs')).toBeVisible();
    expect(screen.getByText('Sheet body content')).toBeVisible();

    // Half -> expanded: everything stays visible, no clipping.
    await user.click(screen.getByRole('button', { name: 'Expand panel to full height' }));
    expect(screen.getByText('Sheet body content')).toBeVisible();

    // Expanded -> collapsed: only the grabber and header remain.
    await user.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(screen.getByText('Sheet tabs')).toBeVisible();
    expect(screen.queryByText('Sheet body content')).not.toBeInTheDocument();

    // Collapsed -> half: body returns.
    await user.click(screen.getByRole('button', { name: 'Expand panel to half height' }));
    expect(screen.getByText('Sheet body content')).toBeVisible();
  });

  it('exposes the collapsed state to assistive technology', async () => {
    const user = userEvent.setup();
    renderSheet();
    const snap = screen.getByRole('button', { name: 'Expand panel to full height' });
    expect(snap).toHaveAttribute('aria-expanded', 'true');
    await user.click(snap);
    await user.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(
      screen.getByRole('button', { name: 'Expand panel to half height' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });
});
