/**
 * Optimistic toggle rollback test: simulates the race fixed in maintenance/01.
 * A toggle whose server request fails with 412 must roll back to the prior
 * status, show an error, and leave the app usable.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoDto } from '../api/types';

const todo: TodoDto = {
  id: 't1', orgId: 'o1', title: 'Write report', description: '', status: 'Open',
  priority: 'High', tags: [], dueDate: null, createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(), version: 3, isDeleted: false, isArchived: false,
};

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: vi.fn(async (path: string) => {
      if (path === '/api/v1/orgs/o1/todos')
        return { data: { items: [todo], page: 1, pageSize: 10, total: 1, totalPages: 1 }, etag: null };
      if (path === `/api/v1/orgs/o1/todos/${todo.id}`)
        return { data: todo, etag: '"v3"' };
      if (path.endsWith('/status'))
        throw new actual.ApiError(412, 'Version mismatch', { code: 'precondition-failed', correlationId: 'test-cid' });
      return { data: {}, etag: null };
    }),
  };
});

import { TodoList } from '../App';
import { api as apiMock } from '../api/client';

describe('optimistic toggle rollback', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rolls back UI state and shows an error after a 412 conflict', async () => {
    render(<TodoList orgId="o1" />);
    expect(await screen.findByText('Write report')).toBeInTheDocument();
    // wait until the row's ETag has been loaded (per-row GET completed)
    await waitFor(() => expect(vi.mocked(apiMock)).toHaveBeenCalledWith(`/api/v1/orgs/o1/todos/${todo.id}`), { timeout: 10000 });
    await userEvent.click(await screen.findByRole('button', { name: /Mark done: Write report/ }));
    // The 412 rolls the optimistic update back with a clear error…
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/changed elsewhere/), { timeout: 5000 });
    // …restoring the true server state and leaving the app usable.
    await waitFor(() => expect(screen.getByText('Open', { selector: '.pill' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Mark done: Write report/ })).toBeEnabled();
  }, 20000);

  it('rapid double-toggle settles on the true server state, not a phantom', async () => {
    render(<TodoList orgId="o1" />);
    expect(await screen.findByText('Write report')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(apiMock)).toHaveBeenCalledWith(`/api/v1/orgs/o1/todos/${todo.id}`), { timeout: 10000 });
    const btn = await screen.findByRole('button', { name: /Mark done: Write report/ });
    await userEvent.click(btn);
    await userEvent.click(btn);
    await waitFor(() => expect(screen.getByText('Open', { selector: '.pill' })).toBeInTheDocument(), { timeout: 5000 });
  }, 20000);
});
