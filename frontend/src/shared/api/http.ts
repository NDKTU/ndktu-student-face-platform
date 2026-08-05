/**
 * Ошибка ответа сервера: несёт статус, чтобы вызывающий мог различить 404 и 500.
 *
 * `payload` — разобранное тело ответа целиком. Оно нужно на удалениях: бэкенд
 * отвечает 409 с `{detail: {requires_confirmation, message, warnings: [...]}}`,
 * и экран показывает по нему диалог подтверждения, после чего повторяет запрос
 * с `?force=true`. Без payload от такого ответа осталась бы одна строка.
 */
export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

// Прод: nginx проксирует /api на backend:8000. Дев: то же делает vite.config.ts.
// В обоих случаях путь относительный, поэтому переменную можно не задавать.
//
// `||`, а не `??`: незаданный build-arg в Dockerfile превращается в пустую
// строку, а не в undefined. С `??` запасное значение не сработало бы, и все
// запросы ушли бы мимо /api — на сам SPA.
const BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

/** Обычный запрос. Загрузки и выгрузки файлов заметно дольше — им свой лимит. */
const DEFAULT_TIMEOUT_MS = 15_000;
const FILE_TIMEOUT_MS = 120_000;

/**
 * Токен и реакция на 401 живут в сессии, но импортировать стор сюда нельзя:
 * стор сам ходит в API, получилась бы циклическая зависимость. Поэтому
 * сессия регистрирует себя один раз при инициализации.
 */
let getToken: () => string | null = () => null;
let onUnauthorized: (kickedBySession: boolean) => void = () => {};

export function configureAuth(options: {
  token: () => string | null;
  unauthorized: (kickedBySession: boolean) => void;
}) {
  getToken = options.token;
  onUnauthorized = options.unauthorized;
}

/** Сообщение бэкенда о вытеснении сессии входом с другого устройства. */
const SESSION_EVICTED = 'Joriy sessiya yakunlandi';

interface RequestOptions {
  /** FormData: Content-Type не ставим — браузер сам допишет boundary. */
  form?: FormData;
  /** Ответ — файл, а не JSON. */
  blob?: boolean;
  timeoutMs?: number;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const token = getToken();
  const timeoutMs =
    opts.timeoutMs ?? (opts.form || opts.blob ? FILE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  // Нативный fetch не умеет таймаут: без этого зависший запрос держал бы
  // экран в состоянии «loading» бесконечно.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const hasJsonBody = opts.form === undefined && body !== undefined;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.form ?? (hasJsonBody ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (cause) {
    // Сеть недоступна, сервер не поднят, CORS не пропустил — либо наш таймаут.
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    throw new ApiError(
      0,
      aborted
        ? `So'rov ${Math.round(timeoutMs / 1000)} soniyada javob bermadi`
        : cause instanceof Error
          ? cause.message
          : 'Network error',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = await readBody(response);
    const message = errorMessage(payload, response.status);

    if (response.status === 401) {
      // Токен протух, аккаунт заблокировали или вход выполнен с другого
      // устройства: сессию надо сбросить, иначе экран останется висеть
      // с ошибками на каждом запросе.
      onUnauthorized(message.includes(SESSION_EVICTED));
    } else if (response.status === 403) {
      // Прав не хватило — но вход в силе. Админ мог поменять роль прямо
      // сейчас, поэтому просим сессию перечитать /user/me. Выкидывать
      // пользователя здесь нельзя: он просто нажал не на ту кнопку.
      window.dispatchEvent(new CustomEvent('app:refresh-me'));
    }

    throw new ApiError(response.status, message, payload);
  }

  if (opts.blob) return (await response.blob()) as T;

  // 204 приходит на удаление — тела нет.
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // Тело не JSON (502 от nginx, пустой ответ) — падать на этом не нужно.
    return null;
  }
}

/**
 * FastAPI кладёт причину в `detail`, но не всегда строкой: на удалениях это
 * объект с `message`, на 422 — массив ошибок валидации.
 */
function errorMessage(payload: unknown, status: number): string {
  const detail = (payload as { detail?: unknown } | null)?.detail;

  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (typeof first?.msg === 'string') return first.msg;
  }

  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }

  return `HTTP ${status}`;
}

/**
 * Query-строка для списочных эндпоинтов (`?page=&limit=&<фильтр>`).
 * Пустые значения выбрасываем: `?name=` бэкенд принял бы за фильтр по
 * пустой строке и не вернул бы ничего.
 */
export function qs(params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  /** Бэкенд обновляет только через PUT — маршрутов на PATCH там нет ни одного. */
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),

  /**
   * @deprecated Ни один маршрут бэкенда не отвечает на PATCH. Метод остаётся
   * только потому, что модули `shared/api/*`, ещё не переведённые на боевые
   * эндпоинты, продолжают его звать. Удаляется вместе с последним вызовом.
   */
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),

  /** Загрузка файла: картинка вопроса, аватар сотрудника, excel с вопросами. */
  // timeoutMs — для больших файлов: двух минут по умолчанию видео не хватает.
  postForm: <T>(path: string, form: FormData, timeoutMs?: number) =>
    request<T>('POST', path, undefined, { form, timeoutMs }),

  /** Выгрузка файла: excel с банком вопросов. */
  getBlob: (path: string) => request<Blob>('GET', path, undefined, { blob: true }),
};
