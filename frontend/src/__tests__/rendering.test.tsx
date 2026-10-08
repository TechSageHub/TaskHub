import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('todo rendering states', () => {
  it('shows a loading state on boot', () => {
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading TaskHub/);
  });
});
