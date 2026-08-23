const { describe, expect, test } = require('bun:test');

const {
  PrivilegedEmailError,
  assertPrivilegedEmailAllowed,
  isAllowedPrivilegedEmail,
  isPrivilegedRole
} = require('../src/services/privileged-email');

describe('privileged e-mail policy', () => {
  test('allows admins and operators only on approved exact domains', () => {
    expect(isPrivilegedRole('admin')).toBe(true);
    expect(isPrivilegedRole('operator')).toBe(true);
    expect(isPrivilegedRole('user')).toBe(false);
    expect(isAllowedPrivilegedEmail('admin@zerocert.com.br')).toBe(true);
    expect(isAllowedPrivilegedEmail('OPERADOR@ZEROCERTY.COM')).toBe(true);
    expect(isAllowedPrivilegedEmail('admin@mail.zerocert.com.br')).toBe(false);
    expect(isAllowedPrivilegedEmail('admin@zerocert.local')).toBe(false);
    expect(isAllowedPrivilegedEmail('admin@example.com')).toBe(false);
  });

  test('rejects privileged roles with invalid e-mail domains and ignores normal users', () => {
    expect(() => assertPrivilegedEmailAllowed({ role: 'admin', email: 'admin@example.com' })).toThrow(PrivilegedEmailError);
    expect(() => assertPrivilegedEmailAllowed({ role: 'operator', email: 'operator@zerocert.local' })).toThrow(PrivilegedEmailError);
    expect(assertPrivilegedEmailAllowed({ role: 'user', email: 'user@example.com' })).toBe(true);
  });
});
