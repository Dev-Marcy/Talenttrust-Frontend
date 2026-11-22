import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusClient from '../StatusClient';
import type { ContractHealth } from '@/lib/status';

const operational: ContractHealth = {
  state: 'operational',
  deployed: true,
  latestLedger: 1234,
  lastModifiedLedger: 1200,
  liveUntilLedger: 5000,
  checkedAt: '2026-11-22T09:00:00.000Z',
  latencyMs: 42,
};

describe('StatusClient', () => {
  it('renders the contract health from a real-shaped check', async () => {
    const checker = jest.fn().mockResolvedValue(operational);

    render(<StatusClient checker={checker} pollIntervalMs={0} />);

    expect(await screen.findByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(checker).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.anything() }));
  });

  it('shows the degraded reason when the contract is missing', async () => {
    const checker = jest.fn().mockResolvedValue({
      ...operational,
      state: 'degraded',
      deployed: false,
      message: 'The contract instance was not found in the current ledger.',
    });

    render(<StatusClient checker={checker} pollIntervalMs={0} />);

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(
      screen.getByText('The contract instance was not found in the current ledger.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('re-checks on demand', async () => {
    const user = userEvent.setup();
    const checker = jest.fn().mockResolvedValue(operational);

    render(<StatusClient checker={checker} pollIntervalMs={0} />);
    await screen.findByText('Operational');

    await user.click(screen.getByRole('button', { name: 'Check now' }));

    expect(checker).toHaveBeenCalledTimes(2);
  });

  it('shows a failed check', async () => {
    const checker = jest.fn().mockRejectedValue(new Error('network down'));

    render(<StatusClient checker={checker} pollIntervalMs={0} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Status check failed');
    expect(alert).toHaveTextContent('network down');
  });
});
