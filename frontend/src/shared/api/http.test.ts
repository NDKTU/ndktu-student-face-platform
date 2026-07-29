import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, configureAuth, qs } from './http';

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

/** URL, с которым в итоге позвали fetch. */
function calledUrl(call = 0) {
  return (fetchMock.mock.calls[call] as [string, RequestInit])[0];
}

function calledInit(call = 0) {
  return (fetchMock.mock.calls[call] as [string, RequestInit])[1];
}

describe('http', () => {
  it('бьёт по /api — тот же путь и в дев-прокси, и за nginx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await api.get('/user/me');

    expect(calledUrl()).toBe('/api/user/me');
  });

  it('пустой VITE_API_URL — это «не задан», а не «пустой префикс»', async () => {
    // Не указанный в docker build --build-arg доезжает до Vite пустой строкой,
    // а не undefined. Пока здесь стояло `??`, запасное значение не срабатывало,
    // запросы уходили на сам SPA и nginx отвечал 405.
    vi.stubEnv('VITE_API_URL', '');
    vi.resetModules();
    const { api: freshApi } = await import('./http');
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await freshApi.get('/user/me');

    expect(calledUrl()).toBe('/api/user/me');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('заданный VITE_API_URL уважается, хвостовой слэш срезается', async () => {
    vi.stubEnv('VITE_API_URL', 'https://lms.ndktu.uz/api/');
    vi.resetModules();
    const { api: freshApi } = await import('./http');
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await freshApi.get('/user/me');

    expect(calledUrl()).toBe('https://lms.ndktu.uz/api/user/me');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('подставляет токен в Authorization', async () => {
    configureAuth({ token: () => 'jwt-123', unauthorized: () => {} });
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1 }]));

    await api.get('/subject/');

    expect((calledInit().headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
  });

  it('без токена заголовка нет — иначе улетело бы «Bearer null»', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await api.get('/subject/');

    expect(calledInit().headers).not.toHaveProperty('Authorization');
  });

  it('401 сбрасывает сессию', async () => {
    const unauthorized = vi.fn();
    configureAuth({ token: () => 'stale', unauthorized });
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Avtorizatsiya talab qilinadi' }, 401));

    await expect(api.get('/subject/')).rejects.toThrow('Avtorizatsiya talab qilinadi');
    expect(unauthorized).toHaveBeenCalledWith(false);
  });

  it('вытеснение другой сессией отличается от протухшего токена', async () => {
    const unauthorized = vi.fn();
    configureAuth({ token: () => 'evicted', unauthorized });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Joriy sessiya yakunlandi. Boshqa qurilmadan kirildi' }, 401),
    );

    await expect(api.get('/subject/')).rejects.toThrow(/Joriy sessiya yakunlandi/);
    // Пользователю надо показать разные сообщения — иначе «меня выкинуло» и
    // «я давно не заходил» выглядят одинаково.
    expect(unauthorized).toHaveBeenCalledWith(true);
  });

  it('403 сессию не трогает, но просит перечитать профиль', async () => {
    const unauthorized = vi.fn();
    const onRefresh = vi.fn();
    configureAuth({ token: () => 'jwt-123', unauthorized });
    window.addEventListener('app:refresh-me', onRefresh);
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Ruxsat yetarli emas' }, 403));

    await expect(api.get('/faculty/')).rejects.toMatchObject({
      status: 403,
      message: 'Ruxsat yetarli emas',
    });

    expect(unauthorized).not.toHaveBeenCalled();
    // Права могли только что измениться — их стоит перечитать.
    expect(onRefresh).toHaveBeenCalledOnce();
    window.removeEventListener('app:refresh-me', onRefresh);
  });

  it('409 на удалении доносит warnings целиком, а не одну строку', async () => {
    const body = {
      detail: {
        requires_confirmation: true,
        message: 'Fakultetda bogliq yozuvlar bor',
        warnings: ['3 ta kafedra', '12 ta guruh'],
      },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(body, 409));

    const error = await api.delete('/faculty/1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    // Без payload экран не смог бы показать диалог подтверждения.
    expect((error as ApiError).message).toBe('Fakultetda bogliq yozuvlar bor');
    expect((error as ApiError).payload).toEqual(body);
  });

  it('422 читает первую ошибку валидации, а не печатает «HTTP 422»', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: [{ loc: ['body', 'name'], msg: 'Field required' }] }, 422),
    );

    await expect(api.post('/faculty/', {})).rejects.toThrow('Field required');
  });

  it('не-JSON тело (502 от nginx) не роняет разбор ответа', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));

    await expect(api.get('/subject/')).rejects.toThrow('HTTP 502');
  });

  it('204 не пытается разобрать пустое тело', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api.delete('/faculty/1')).resolves.toBeUndefined();
  });

  it('FormData уходит без Content-Type — boundary дописывает браузер', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ url: '/uploads/a.png' }));
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.png');

    await api.postForm('/question/upload_image', form);

    expect(calledInit().headers).not.toHaveProperty('Content-Type');
    expect(calledInit().body).toBe(form);
  });

  it('недоступная сеть превращается в ApiError со статусом 0', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(api.get('/subject/')).rejects.toBeInstanceOf(ApiError);
  });

  it('прерванный по таймауту запрос объясняет себя, а не молчит', async () => {
    const aborted = new Error('The operation was aborted');
    aborted.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(aborted);

    await expect(api.get('/subject/')).rejects.toThrow(/javob bermadi/);
  });
});

describe('qs', () => {
  it('собирает строку запроса', () => {
    expect(qs({ page: 2, limit: 50 })).toBe('?page=2&limit=50');
  });

  it('выбрасывает пустые значения: ?name= вернуло бы пустой список', () => {
    expect(qs({ name: '', group_id: undefined, page: 1 })).toBe('?page=1');
  });

  it('без параметров строки нет вовсе', () => {
    expect(qs({})).toBe('');
  });
});
