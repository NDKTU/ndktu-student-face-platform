import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToken, getToken, setToken } from './tokenStorage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('tokenStorage', () => {
  it('кладёт и достаёт токен', () => {
    setToken('jwt-123');
    expect(getToken()).toBe('jwt-123');
  });

  it('хранит под ключом «token» — тем же, что и старый интерфейс', () => {
    // Оба приложения живут на одном origin и делят одну активную сессию:
    // разные ключи означали бы два токена и гонку за один серверный jti.
    setToken('jwt-123');
    expect(localStorage.getItem('token')).toBe('jwt-123');
  });

  it('без токена возвращает null', () => {
    expect(getToken()).toBeNull();
  });

  it('очистка стирает токен', () => {
    setToken('jwt-123');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('недоступное хранилище не роняет приложение', () => {
    // Firefox в строгом режиме бросает SecurityError на любое обращение,
    // а getToken() вызывается на каждом запросе.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => setToken('jwt-123')).not.toThrow();
    expect(getToken()).toBeNull();
    expect(() => clearToken()).not.toThrow();
  });
});
