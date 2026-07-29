import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, configureAuth } from './http';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  configureAuth({ token: () => null, unauthorized: () => {} });
});

describe('http', () => {
  it('подставляет токен в Authorization', async () => {
    configureAuth({ token: () => 'jwt-123', unauthorized: () => {} });
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1 }]));

    await api.get('/fanlar');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
  });

  it('без токена заголовка нет — иначе улетело бы «Bearer null»', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await api.get('/fanlar');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('401 сбрасывает сессию: токен протух или аккаунт заблокировали', async () => {
    const unauthorized = vi.fn();
    configureAuth({ token: () => 'stale', unauthorized });
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Avtorizatsiya talab qilinadi' }, 401));

    await expect(api.get('/fanlar')).rejects.toThrow('Avtorizatsiya talab qilinadi');
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('403 сессию не трогает — прав не хватает, но вход в силе', async () => {
    const unauthorized = vi.fn();
    configureAuth({ token: () => 'jwt-123', unauthorized });
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Ruxsat yetarli emas' }, 403));

    await expect(api.get('/tuzilma/tree')).rejects.toMatchObject({
      status: 403,
      message: 'Ruxsat yetarli emas',
    });
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('недоступная сеть превращается в ApiError со статусом 0', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(api.get('/fanlar')).rejects.toBeInstanceOf(ApiError);
  });
});
