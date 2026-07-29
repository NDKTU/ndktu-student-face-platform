/** Ошибка ответа сервера: несёт статус, чтобы вызывающий мог различить 404 и 500. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/**
 * Токен и реакция на 401 живут в сессии, но импортировать стор сюда нельзя:
 * стор сам ходит в API, получилась бы циклическая зависимость. Поэтому
 * сессия регистрирует себя один раз при инициализации.
 */
let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

export function configureAuth(options: {
  token: () => string | null;
  unauthorized: () => void;
}) {
  getToken = options.token;
  onUnauthorized = options.unauthorized;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  const token = getToken();

  try {
    response = await fetch(`${BASE_URL}/api/v1${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    // Сеть недоступна: сервер не поднят или CORS не пропустил.
    throw new ApiError(0, cause instanceof Error ? cause.message : 'Network error');
  }

  if (!response.ok) {
    // Токен протух или аккаунт заблокировали: сессию надо сбросить, иначе
    // экран останется висеть с ошибками на каждом запросе.
    if (response.status === 401) onUnauthorized();
    throw new ApiError(response.status, await readError(response));
  }

  // 204 приходит на удаление — тела нет.
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string') return data.detail;
  } catch {
    // тело не JSON — падать на этом не нужно
  }
  return `HTTP ${response.status}`;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),
};
