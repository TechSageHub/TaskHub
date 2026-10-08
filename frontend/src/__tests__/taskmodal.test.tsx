/**
 * TaskModal (create/edit dialog): client validation, Escape-to-close,
 * and successful create flowing through to onSaved.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: vi.fn(async () => ({ data: { id: 'new1' }, etag: '"v1"' })),
  };
});

import { api as apiMock } from '../api/client';
import TaskModal from '../components/TaskModal';

describe('TaskModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a validation error and does not submit with an empty title', async () => {
    render(<TaskModal orgId="o1" editing={null} onClose={() => {}} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create todo' }));
    expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    expect(vi.mocked(apiMock)).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<TaskModal orgId="o1" editing={null} onClose={onClose} onSaved={() => {}} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a todo and reports success', async () => {
    const onSaved = vi.fn();
    render(<TaskModal orgId="o1" editing={null} onClose={() => {}} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/Title \(required\)/), 'New thing');
    await userEvent.click(screen.getByRole('button', { name: 'Create todo' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiMock)).toHaveBeenCalledWith(
      '/api/v1/orgs/o1/todos',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
