import type { OptionLetter, Question, QuestionOption } from '@/entities/question/model/types';
import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для банка вопросов.
 *
 * Формы отличаются заметно: у сервера четыре плоских поля option_a..option_d и
 * буква правильного ответа, у экрана — массив вариантов с флагами. Разложение
 * и сборка живут здесь.
 *
 * Правка вопроса на сервере не меняет строку на месте: она заводит новую
 * версию и снимает is_latest у прежней, чтобы уже сданные работы продолжали
 * ссылаться ровно на тот текст, который видел студент. Отбор последних живых
 * версий делает сам список — здесь его повторять не нужно, иначе правило
 * окажется в двух местах и разъедется.
 */

const LETTERS: OptionLetter[] = ['A', 'B', 'C', 'D'];

interface ApiQuestion {
  id: number;
  subject_id: number;
  user_id: number;
  subject_name: string | null;
  username: string | null;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  version: number;
  is_latest: boolean;
  is_active: boolean;
}

/**
 * Картинка у сервера не отдельное поле: загрузка возвращает ссылку, и она
 * подставляется в текст. Значит «вариант — это картинка» определяется по
 * самой ссылке, а не по флагу.
 */
function looksLikeImage(text: string): boolean {
  return /\/uploads\/\S+\.(png|jpe?g|gif|webp|svg)$/i.test(text.trim());
}

function toQuestion(q: ApiQuestion): Question {
  const texts: Record<OptionLetter, string> = {
    A: q.option_a,
    B: q.option_b,
    C: q.option_c,
    D: q.option_d,
  };
  const correct = q.correct_option.toUpperCase() as OptionLetter;

  const options: QuestionOption[] = LETTERS.map((letter) => ({
    letter,
    text: texts[letter] ?? '',
    image: looksLikeImage(texts[letter] ?? ''),
    correct: letter === correct,
  }));

  return {
    id: q.id,
    subjectId: q.subject_id,
    text: q.text,
    correct,
    hasImage: looksLikeImage(q.text) || options.some((o) => o.image),
    options,
  };
}

export interface QuestionOptionPayload {
  letter: OptionLetter;
  text: string;
}

export interface QuestionCreatePayload {
  subjectId: number;
  /** Автор вопроса: бэкенд требует его явно. */
  userId: number;
  text: string;
  correct: OptionLetter;
  options: QuestionOptionPayload[];
}

export type QuestionUpdatePayload = QuestionCreatePayload;

function toBody(payload: QuestionCreatePayload) {
  const byLetter = new Map(payload.options.map((o) => [o.letter, o.text]));
  return {
    subject_id: payload.subjectId,
    user_id: payload.userId,
    text: payload.text,
    option_a: byLetter.get('A') ?? '',
    option_b: byLetter.get('B') ?? '',
    option_c: byLetter.get('C') ?? '',
    option_d: byLetter.get('D') ?? '',
    correct_option: payload.correct.toLowerCase(),
  };
}

/** Банк одного предмета. Без subjectId вернулись бы вопросы всех предметов. */
export async function getQuestions(subjectId?: number): Promise<Question[]> {
  const items = await getAll<ApiQuestion>('/question/', 'questions', {
    subject_id: subjectId,
  });
  return items.map(toQuestion);
}

export async function createQuestion(payload: QuestionCreatePayload): Promise<Question> {
  return toQuestion(await api.post<ApiQuestion>('/question/', toBody(payload)));
}

export async function updateQuestion(
  id: number,
  payload: QuestionUpdatePayload,
): Promise<Question> {
  return toQuestion(await api.put<ApiQuestion>(`/question/${id}`, toBody(payload)));
}

/** Мягкое удаление: вопрос мог попасть в уже проведённые тесты. */
export const deleteQuestion = (id: number) => api.delete(`/question/${id}`);

/** Загружает картинку и возвращает ссылку — её подставляют в текст варианта. */
export async function uploadQuestionImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { url } = await api.postForm<{ url: string }>('/question/upload_image', form);
  return url;
}

/** Импорт из excel. Возвращает разобранные вопросы и замечания парсера. */
export async function importExcel(
  subjectId: number,
  file: File,
): Promise<{ questions: Question[]; warnings: string[] }> {
  const form = new FormData();
  form.append('file', file);
  const data = await api.postForm<{ questions: ApiQuestion[]; warnings: string[] }>(
    `/question/upload_excel?subject_id=${subjectId}`,
    form,
  );
  return { questions: data.questions.map(toQuestion), warnings: data.warnings ?? [] };
}

/** Выгрузка банка в excel — файл собирает сервер. */
export function downloadExcel(subjectId?: number): Promise<Blob> {
  const query = subjectId === undefined ? '' : `?subject_id=${subjectId}`;
  return api.getBlob(`/question/download_excel${query}`);
}
