import { getList, type Paged } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для психологических методик.
 *
 * Здесь имена полей почти совпадают с серверными: `content` и `options` — это
 * JSONB, чью структуру задаёт `question_type`, и переименовывать ключи внутри
 * них значило бы переписывать их в обе стороны на каждом запросе. Переводим
 * только обёртку.
 */

export type QuestionType =
  | 'text'
  | 'true_false'
  | 'scale'
  | 'image_stimulus'
  | 'image_choice'
  | 'multi_choice';

export const QUESTION_TYPES: QuestionType[] = [
  'text',
  'true_false',
  'scale',
  'image_stimulus',
  'image_choice',
  'multi_choice',
];

/** Вариант ответа. Какие поля заполнены — зависит от типа вопроса. */
export interface QuestionOption {
  text?: string;
  image_url?: string;
  description?: string;
  value: number | string;
}

/**
 * Тело вопроса. Набор ключей задаётся типом:
 * `text`/`true_false` — text; `scale` — text, min, max, min_label?, max_label?;
 * `image_stimulus` — image_url, text?; `image_choice` — text?;
 * `multi_choice` — text, image_url?, description?.
 */
export interface QuestionContent {
  text?: string;
  image_url?: string;
  description?: string;
  min?: number;
  max?: number;
  min_label?: string;
  max_label?: string;
}

export interface PsyQuestion {
  id: number;
  methodId: number;
  type: QuestionType;
  content: QuestionContent;
  options: QuestionOption[];
  order: number;
  /** Имя шкалы для методик со скорингом «по категориям». */
  category: string;
}

/**
 * `instruction` — свободный JSONB, который читает `scoring.py`. Экран правит
 * его как есть: жёсткая схема здесь означала бы, что новая методика требует
 * правки фронтенда.
 */
export type MethodInstruction = Record<string, unknown>;

export interface PsyMethod {
  id: number;
  name: string;
  description: string;
  instruction: MethodInstruction;
  questions: PsyQuestion[];
}

export type Diagnosis =
  | { type: 'sum'; total: number; label: string; description: string }
  | {
      type: 'category';
      scores: Record<string, number>;
      categories: { name: string; score: number; label: string; description: string }[];
    };

export interface PsyAnswer {
  questionId: number;
  value: unknown;
}

export interface PsyResult {
  id: number;
  methodId: number;
  methodName: string;
  userId: number | null;
  username: string;
  answers: PsyAnswer[];
  diagnosis: Diagnosis | null;
  createdAt: string;
  /** Вопросы методики на момент просмотра — нужны, чтобы расшифровать ответы. */
  questions: PsyQuestion[];
}

interface ApiQuestion {
  id: number;
  method_id: number;
  question_type: string;
  content: QuestionContent | null;
  options: QuestionOption[] | null;
  order: number;
  category: string | null;
}

interface ApiMethod {
  id: number;
  name: string;
  description: string;
  instruction: MethodInstruction | null;
  questions?: ApiQuestion[];
}

interface ApiResult {
  id: number;
  method_id: number;
  user_id: number | null;
  answers: { question_id: number; value: unknown }[];
  diagnosis: Diagnosis | null;
  created_at: string;
  method: ApiMethod | null;
  user: { id: number; username: string } | null;
}

function toQuestion(q: ApiQuestion): PsyQuestion {
  return {
    id: q.id,
    methodId: q.method_id,
    type: q.question_type as QuestionType,
    content: q.content ?? {},
    options: q.options ?? [],
    order: q.order,
    category: q.category ?? '',
  };
}

function toMethod(m: ApiMethod): PsyMethod {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    instruction: m.instruction ?? {},
    // Сортируем здесь: порядок вопросов — часть методики, и полагаться на то,
    // что сервер вернёт их по `order`, значит зависеть от деталей запроса.
    questions: (m.questions ?? []).map(toQuestion).sort((a, b) => a.order - b.order),
  };
}

function toResult(r: ApiResult): PsyResult {
  return {
    id: r.id,
    methodId: r.method_id,
    methodName: r.method?.name ?? '',
    userId: r.user_id,
    username: r.user?.username ?? '',
    answers: r.answers.map((a) => ({ questionId: a.question_id, value: a.value })),
    diagnosis: r.diagnosis,
    createdAt: r.created_at,
    questions: (r.method?.questions ?? []).map(toQuestion).sort((a, b) => a.order - b.order),
  };
}

// ── Методики ────────────────────────────────────────────────────────────────

export async function getMethods(page = 1, limit = 50): Promise<Paged<PsyMethod>> {
  const data = await getList<ApiMethod>('/psychology/method/', 'methods', { page, limit });
  return { ...data, items: data.items.map(toMethod) };
}

export const getMethod = (id: number) =>
  api.get<ApiMethod>(`/psychology/method/${id}`).then(toMethod);

export interface MethodDraft {
  name: string;
  description: string;
  instruction: MethodInstruction;
}

export const createMethod = (draft: MethodDraft) =>
  api.post<ApiMethod>('/psychology/method/', draft).then(toMethod);

export const updateMethod = (id: number, draft: Partial<MethodDraft>) =>
  api.put<ApiMethod>(`/psychology/method/${id}`, draft).then(toMethod);

export const deleteMethod = (id: number) => api.delete(`/psychology/method/${id}`);

// ── Вопросы ─────────────────────────────────────────────────────────────────

export interface QuestionDraft {
  type: QuestionType;
  content: QuestionContent;
  options: QuestionOption[];
  order: number;
  category: string;
}

/** `options` у шкалы и «да/нет» на сервере null, а не пустой список. */
function optionsPayload(draft: QuestionDraft): QuestionOption[] | null {
  return draft.options.length > 0 ? draft.options : null;
}

export const createQuestion = (methodId: number, draft: QuestionDraft) =>
  api
    .post<ApiQuestion>('/psychology/question/', {
      method_id: methodId,
      question_type: draft.type,
      content: draft.content,
      options: optionsPayload(draft),
      order: draft.order,
      category: draft.category || null,
    })
    .then(toQuestion);

export const updateQuestion = (id: number, draft: QuestionDraft) =>
  api
    .put<ApiQuestion>(`/psychology/question/${id}`, {
      question_type: draft.type,
      content: draft.content,
      options: optionsPayload(draft),
      order: draft.order,
      category: draft.category || null,
    })
    .then(toQuestion);

export const deleteQuestion = (id: number) => api.delete(`/psychology/question/${id}`);

// ── Прохождение и результаты ────────────────────────────────────────────────

export const submitTest = (methodId: number, answers: PsyAnswer[]) =>
  api
    .post<ApiResult>(`/psychology/test/${methodId}/submit`, {
      answers: answers.map((a) => ({ question_id: a.questionId, value: a.value })),
    })
    .then(toResult);

export interface ResultFilters {
  methodId?: number;
  userId?: number;
  facultyId?: number;
  groupId?: number;
  page?: number;
  limit?: number;
}

export async function getResults(filters: ResultFilters = {}): Promise<Paged<PsyResult>> {
  const data = await getList<ApiResult>('/psychology/test/results/', 'results', {
    method_id: filters.methodId,
    user_id: filters.userId,
    faculty_id: filters.facultyId,
    group_id: filters.groupId,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
  });
  return { ...data, items: data.items.map(toResult) };
}

export const getResult = (id: number) =>
  api.get<ApiResult>(`/psychology/test/results/${id}`).then(toResult);

export const deleteResult = (id: number) => api.delete(`/psychology/test/results/${id}`);

/**
 * Картинки для вопросов заливаются через общий эндпоинт банка вопросов:
 * своего у психологии нет, а хранилище одно и то же.
 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { url } = await api.postForm<{ url: string }>('/question/upload_image', form);
  return url;
}
