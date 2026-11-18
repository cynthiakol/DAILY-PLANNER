// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';

const go = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const jump = (d: string) => fireEvent.change(screen.getByLabelText('Jump to date'), { target: { value: d } });
async function addActivity(title: string, opts: { timed?: boolean } = {}) {
  fireEvent.click(screen.getAllByRole('button', { name: /New activity/ })[0]);
  const dlg = await screen.findByRole('dialog');
  fireEvent.change(within(dlg).getByLabelText('Title'), { target: { value: title } });
  if (opts.timed) fireEvent.click(within(dlg).getByLabelText(/Time-block/));
  fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}
async function openDay(d: string) { go(/Calendar/); await screen.findByLabelText('Jump to date'); jump(d); go(/^Day$/); }

describe('app end to end (simulated browser, real components, real storage layer)', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('plans Nov 24/25 2026, edits, completes, reorders, and survives close/reopen', async () => {
    render(<App />); await screen.findByText('Today');
    await openDay('2026-11-24');
    await addActivity('Alpha'); await addActivity('Beta'); await addActivity('Gym', { timed: true });
    expect(screen.getByText('Anytime / Flexible Tasks')).toBeTruthy();
    jump('2026-11-25'); await addActivity('Gamma');
    expect(screen.queryByText('Alpha')).toBeNull();

    jump('2026-11-24');
    fireEvent.click(screen.getAllByLabelText('Edit')[0]);                         // edit Gym (timed list renders first)
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Title'), { target: { value: 'Gym edited' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await screen.findByText('Gym edited');
    fireEvent.click(screen.getByLabelText('Complete Alpha'));
    fireEvent.click(within(screen.getByText('Beta').closest('li')!).getByLabelText('Move up')); // move Beta above Alpha
    const order = screen.getAllByText(/^(Alpha|Beta)$/).map(e => e.textContent);
    expect(order).toEqual(['Beta', 'Alpha']);

    cleanup(); render(<App />);                                                     // "close and reopen"
    await screen.findByText('Today'); await openDay('2026-11-24');
    expect(screen.getByText('Gym edited')).toBeTruthy();
    expect((screen.getByLabelText('Complete Alpha') as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByText(/^(Alpha|Beta)$/).map(e => e.textContent)).toEqual(['Beta', 'Alpha']);
    jump('2028-02-29'); expect(screen.getByText(/Feb 29, 2028/)).toBeTruthy();
    jump('2026-11-25'); expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it('applies a template twice independently and persists theme', async () => {
    render(<App />); await screen.findByText('Today');
    go(/Templates/);
    fireEvent.click(await screen.findByRole('button', { name: /^Apply to/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Apply to/ }));
    go(/Activities/);
    const before = screen.getAllByText('AQW farming').length;
    expect(before).toBeGreaterThanOrEqual(3);                                       // seed series + 2 independent copies
    go(/Settings/);
    fireEvent.change(screen.getByLabelText(/Theme/), { target: { value: 'light' } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('planner.state')!).settings.theme).toBe('light'));
    cleanup(); render(<App />); await screen.findByText('Today');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('rejects invalid input in the editor and confirms deletes', async () => {
    render(<App />); await screen.findByText('Today');
    fireEvent.click(screen.getAllByRole('button', { name: /New activity/ })[0]);
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Title is required/);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getAllByLabelText('Delete')[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));          // cancel keeps data
    expect(screen.getAllByLabelText('Delete').length).toBeGreaterThan(0);
  });
});
