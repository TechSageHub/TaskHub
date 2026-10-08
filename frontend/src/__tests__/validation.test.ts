import { describe, expect, it } from 'vitest';
import { validateCredentials, validateTodo } from '../api/client';

describe('auth validation', () => {
  it('rejects short usernames and passwords', () => {
    expect(validateCredentials('ab', 'short')).toHaveProperty('username');
    expect(validateCredentials('ab', 'short')).toHaveProperty('password');
  });
  it('rejects illegal username characters', () => {
    expect(validateCredentials('bad user!', 'Password123!')).toHaveProperty('username');
  });
  it('accepts valid credentials', () => {
    expect(validateCredentials('alice_99', 'Password123!')).toEqual({});
  });
});

describe('todo validation', () => {
  it('requires a title', () => {
    expect(validateTodo('', '', [])).toHaveProperty('title');
  });
  it('enforces length limits', () => {
    expect(validateTodo('x'.repeat(201), '', [])).toHaveProperty('title');
    expect(validateTodo('ok', 'x'.repeat(2001), [])).toHaveProperty('description');
  });
  it('rejects bad tags', () => {
    expect(validateTodo('ok', '', ['bad tag!'])).toHaveProperty('tags');
    expect(validateTodo('ok', '', Array(11).fill('a'))).toHaveProperty('tags');
  });
  it('accepts a valid todo', () => {
    expect(validateTodo('Buy milk', 'desc', ['home', 'urgent-1'])).toEqual({});
  });
});
