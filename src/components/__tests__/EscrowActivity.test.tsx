import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EscrowActivity from '../escrow/EscrowActivity';
import type { ActivityEvent } from '@/lib/stellar/events';

const CONTRACT = 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ';

const events: ActivityEvent[] = [
  {
    id: 'evt-2',
    ledger: 900,
    closedAt: '2026-11-02T10:00:00Z',
    txHash: 'tx2',
    contractId: CONTRACT,
    kind: 'milestone_paid',
    topics: [],
    actor: null,
    value: '500',
    summary: 'milestone_paid · 500',
  },
  {
    id: 'evt-1',
    ledger: 800,
    closedAt: '2026-11-01T10:00:00Z',
    txHash: 'tx1',
    contractId: CONTRACT,
    kind: 'transfer',
    topics: ['GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H'],
    actor: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
    value: '100',
    summary: 'transfer · 100',
  },
];

describe('EscrowActivity', () => {
  it('renders decoded events newest first', async () => {
    const fetcher = jest.fn().mockResolvedValue(events);

    render(<EscrowActivity contractId={CONTRACT} fetcher={fetcher} />);

    expect(await screen.findByText('milestone_paid · 500')).toBeInTheDocument();
    expect(screen.getByText('transfer · 100')).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(CONTRACT, expect.objectContaining({ signal: expect.anything() }));

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('milestone_paid');
  });

  it('shows an empty state when the contract has no recent events', async () => {
    render(<EscrowActivity contractId={CONTRACT} fetcher={jest.fn().mockResolvedValue([])} />);

    expect(
      await screen.findByText(/No activity has been recorded for this contract/),
    ).toBeInTheDocument();
  });

  it('shows the fetch error and retries', async () => {
    const user = userEvent.setup();
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('Could not load contract activity from the Stellar RPC.'))
      .mockResolvedValueOnce(events);

    render(<EscrowActivity contractId={CONTRACT} fetcher={fetcher} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Activity unavailable');
    expect(alert).toHaveTextContent('Could not load contract activity from the Stellar RPC.');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('milestone_paid · 500')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('limits the number of rendered events', async () => {
    render(<EscrowActivity contractId={CONTRACT} fetcher={jest.fn().mockResolvedValue(events)} limit={1} />);

    expect(await screen.findByText('milestone_paid · 500')).toBeInTheDocument();
    expect(screen.queryByText('transfer · 100')).not.toBeInTheDocument();
  });
});
