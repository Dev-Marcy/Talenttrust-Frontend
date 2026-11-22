import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MilestoneBuilder from '../MilestoneBuilder';

const VALID_CSV = [
  'title,payout,currency,dueDate,status',
  'Kickoff,2500,USD,"Jun 1, 2026",Pending',
  'Design handoff,1200,XLM,,Active',
].join('\n');

describe('MilestoneBuilder', () => {
  it('previews parsed rows and imports them', async () => {
    const user = userEvent.setup();
    const onImport = jest.fn();

    render(<MilestoneBuilder onImport={onImport} contractId="contract-1" />);

    fireEvent.change(screen.getByLabelText('Or paste CSV'), {
      target: { value: VALID_CSV },
    });
    await user.click(screen.getByRole('button', { name: 'Preview import' }));

    expect(screen.getByText('2 ready')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Kickoff' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'XLM' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import 2 milestones' }));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toEqual([
      expect.objectContaining({ title: 'Kickoff', payout: 2500, contractId: 'contract-1' }),
      expect.objectContaining({ title: 'Design handoff', currency: 'XLM', status: 'Active' }),
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Imported 2 milestones.');
  });

  it('blocks the import and lists row errors when validation fails', async () => {
    const user = userEvent.setup();
    const onImport = jest.fn();

    render(<MilestoneBuilder onImport={onImport} />);

    fireEvent.change(screen.getByLabelText('Or paste CSV'), {
      target: { value: 'title,payout,currency\n,100,USD' },
    });
    await user.click(screen.getByRole('button', { name: 'Preview import' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Fix these rows before importing');
    expect(alert).toHaveTextContent('Row 2: Title is required');
    expect(screen.getByRole('button', { name: 'Import milestones' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Import milestones' }));
    expect(onImport).not.toHaveBeenCalled();
  });

  it('reports a missing header column', async () => {
    const user = userEvent.setup();

    render(<MilestoneBuilder onImport={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Or paste CSV'), {
      target: { value: 'title,currency\nKickoff,USD' },
    });
    await user.click(screen.getByRole('button', { name: 'Preview import' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Row 1: Missing required column: payout.',
    );
  });

  it('disables preview until there is CSV text', () => {
    render(<MilestoneBuilder onImport={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Preview import' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import milestones' })).toBeDisabled();
  });
});
