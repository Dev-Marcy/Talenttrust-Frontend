import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReputationLookup from '../ReputationLookup';
import { ReputationLookupError } from '@/lib/reputationLookup';
import { resetCache } from '@/lib/safeStorage';
import { REPUTATION_HISTORY_KEY } from '@/lib/reputationHistory';

const ADDRESS = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';

const result = {
  address: ADDRESS,
  score: 4.5,
  level: 'Expert',
  history: [
    { id: 'evt-1', type: 'Contract', summary: 'Completed 3 milestones', date: '2026-11-01' },
  ],
};

describe('ReputationLookup', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetCache();
  });

  it('rejects an invalid address without calling the loader', async () => {
    const user = userEvent.setup();
    const loader = jest.fn();

    render(<ReputationLookup loader={loader} />);
    await user.type(screen.getByLabelText('Stellar address'), 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That is not a valid Stellar account address.',
    );
    expect(loader).not.toHaveBeenCalled();
  });

  it('loads and renders a reputation summary, then remembers it', async () => {
    const user = userEvent.setup();
    const loader = jest.fn().mockResolvedValue(result);

    render(<ReputationLookup loader={loader} />);
    await user.type(screen.getByLabelText('Stellar address'), ADDRESS);
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('Expert')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '4.5');
    expect(screen.getByText('Completed 3 milestones')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith(ADDRESS, expect.objectContaining({ signal: expect.anything() }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `Remove ${ADDRESS} from recent lookups` }),
      ).toBeInTheDocument();
    });
    expect(window.localStorage.getItem(REPUTATION_HISTORY_KEY)).toContain(ADDRESS);
  });

  it('shows the error message and retries with the same address', async () => {
    const user = userEvent.setup();
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new ReputationLookupError('Reputation service unavailable.', 'service'))
      .mockResolvedValueOnce(result);

    render(<ReputationLookup loader={loader} />);
    await user.type(screen.getByLabelText('Stellar address'), ADDRESS);
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('Reputation service unavailable.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Expert')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('re-runs a lookup from the recent list and can clear the list', async () => {
    const user = userEvent.setup();
    const loader = jest.fn().mockResolvedValue(result);

    window.localStorage.setItem(
      REPUTATION_HISTORY_KEY,
      JSON.stringify([
        { address: ADDRESS, score: 4.5, level: 'Expert', lookedUpAt: '2026-11-01T10:00:00.000Z' },
      ]),
    );

    render(<ReputationLookup loader={loader} />);

    const recentButton = await screen.findByTitle(ADDRESS);
    await user.click(recentButton);

    await waitFor(() => expect(loader).toHaveBeenCalledWith(ADDRESS, expect.anything()));

    await user.click(screen.getByRole('button', { name: 'Clear recent lookups' }));

    expect(screen.queryByTitle(ADDRESS)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(REPUTATION_HISTORY_KEY)).toBeNull();
  });
});
