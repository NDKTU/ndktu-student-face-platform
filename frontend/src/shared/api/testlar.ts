import type {
  QuizQuestion,
  QuizResult,
  StudentAttempt,
  TestDetailData,
  TestMeta,
  TestStatus,
} from '@/entities/test/model/types';
import { initials } from '@/shared/lib/initials';
import { getAll } from './envelope';
import { api } from './http';
import { groupName } from '@/shared/lib/displayName';

/**
 * Граница до бэкенда для тестов.
 *
 * Прохождение теста устроено иначе, чем в прототипе: там был один запрос со
 * всеми ответами, здесь — попытка (`start_quiz` заводит её и отдаёт вопросы
 * без правильных ответов), затем ответ на каждый вопрос по отдельности и
 * `end_quiz`, который и подводит итог. Балл считает только сервер.
 */

const LETTERS = ['A', 'B', 'C', 'D'] as const;

interface ApiQuiz {
  id: number;
  title: string;
  question_number: number;
  duration: number;
  pin: string;
  is_active: boolean;
  proctoring_mode: 'face' | 'standard';
  attempt: number | null;
  user_id: number | null;
  group_id: number | null;
  subject_id: number | null;
  subject: { id: number; name: string } | null;
  group: { id: number; name: string } | null;
  teacher: { id: number; username: string; full_name: string | null } | null;
}

interface ApiDetailQuestion {
  id: number;
  text: string;
  options: { letter: string; text: string }[];
  correct: number;
}

interface ApiAttempt {
  result_id: number;
  user_id: number;
  full_name: string;
  submitted: boolean;
  correct_answers: number;
  wrong_answers: number;
  total: number;
  grade: number;
  spent_seconds: number | null;
  finished_at: string | null;
  answers: { question_id: number; answer: string | null; is_correct: boolean | null }[];
}

interface ApiQuizDetail {
  quiz: ApiQuiz;
  questions: ApiDetailQuestion[];
  attempts: ApiAttempt[];
  stats: {
    submitted: number;
    total_students: number;
    avg_grade: number;
    max_grade: number;
    min_grade: number;
    avg_seconds: number | null;
  };
  per_question: { question_id: number; correct: number; wrong: number }[];
}

/**
 * Статус теста — это флаг is_active. Третьего состояния («Yopilgan») на
 * бэкенде нет, поэтому и здесь их два.
 */
function toStatus(isActive: boolean): TestStatus {
  return isActive ? 'Faol' : 'Yopiq';
}

function toMeta(quiz: ApiQuiz): TestMeta {
  return {
    id: quiz.id,
    name: quiz.title,
    fan: quiz.subject?.name ?? '',
    oqituvchi: quiz.teacher?.full_name ?? quiz.teacher?.username ?? '',
    guruh: quiz.group ? groupName(quiz.group.name) : '',
    savollar: quiz.question_number,
    davomiylik: quiz.duration,
    holati: toStatus(quiz.is_active),
    pin: quiz.pin,
  };
}

/** «1234» секунд → «20:34»: в таблицах время показывают, а не считают. */
function toClock(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toDate(iso: string | null): string {
  if (!iso) return '';
  const [date] = iso.split('T');
  const parts = date?.split('-');
  return parts?.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : (date ?? '');
}

export interface TestCreatePayload {
  name: string;
  subjectId: number | null;
  groupId: number | null;
  teacherId: number | null;
  savollar: number;
  davomiylik: number;
  pin: string;
  isActive: boolean;
  proctoring: 'face' | 'standard';
}

export interface TestUpdatePayload {
  name?: string;
  savollar?: number;
  davomiylik?: number;
  pin?: string;
  holati?: TestStatus;
  proctoring?: 'face' | 'standard';
}

export async function getTests(): Promise<TestMeta[]> {
  const quizzes = await getAll<ApiQuiz>('/quiz/', 'quizzes');
  return quizzes.map(toMeta);
}

export async function createTest(body: TestCreatePayload): Promise<TestMeta> {
  const created = await api.post<ApiQuiz>('/quiz/', {
    title: body.name,
    question_number: body.savollar,
    duration: body.davomiylik,
    pin: body.pin,
    user_id: body.teacherId,
    group_id: body.groupId,
    subject_id: body.subjectId,
    is_active: body.isActive,
    proctoring_mode: body.proctoring,
  });
  return toMeta(created);
}

export async function updateTest(id: number, body: TestUpdatePayload): Promise<TestMeta> {
  const updated = await api.put<ApiQuiz>(`/quiz/${id}`, {
    ...(body.name !== undefined && { title: body.name }),
    ...(body.savollar !== undefined && { question_number: body.savollar }),
    ...(body.davomiylik !== undefined && { duration: body.davomiylik }),
    ...(body.pin !== undefined && { pin: body.pin }),
    ...(body.holati !== undefined && { is_active: body.holati === 'Faol' }),
    ...(body.proctoring !== undefined && { proctoring_mode: body.proctoring }),
  });
  return toMeta(updated);
}

export const deleteTest = (id: number, force = false) =>
  api.delete(`/quiz/${id}${force ? '?force=true' : ''}`);

/** Аналитика теста: вопросы с правильными ответами, попытки и сводка. */
export async function getTestDetail(id: number): Promise<TestDetailData> {
  const data = await api.get<ApiQuizDetail>(`/quiz/${id}/detail`);

  const questions: QuizQuestion[] = data.questions.map((q) => ({
    text: q.text,
    image: false,
    options: q.options.map((o, i) => ({
      letter: LETTERS[i] ?? 'A',
      text: o.text,
      image: false,
    })),
    correct: q.correct,
  }));

  // Экран ждёт ответы как «индекс вопроса → индекс варианта», а сервер хранит
  // выбранный текст: он не зависит от порядка показа и переживает правку теста.
  const questionIndex = new Map(data.questions.map((q, i) => [q.id, i]));

  const students: StudentAttempt[] = data.attempts.map((a) => {
    const answers: Record<number, number> = {};
    for (const row of a.answers) {
      const qIndex = questionIndex.get(row.question_id);
      if (qIndex === undefined || row.answer === null) continue;
      const option = data.questions[qIndex]?.options.findIndex((o) => o.text === row.answer);
      if (option !== undefined && option >= 0) answers[qIndex] = option;
    }

    return {
      id: a.result_id,
      fish: a.full_name,
      initials: initials(a.full_name),
      submitted: a.submitted,
      answers,
      ball: a.correct_answers,
      total: a.total,
      pct: a.total > 0 ? Math.round((a.correct_answers / a.total) * 100) : 0,
      time: toClock(a.spent_seconds),
      secsN: a.spent_seconds ?? 0,
      sana: toDate(a.finished_at),
    };
  });

  return {
    questions,
    students,
    stats: {
      submitted: data.stats.submitted,
      total: data.stats.total_students,
      avg: data.stats.avg_grade,
      max: String(data.stats.max_grade),
      min: String(data.stats.min_grade),
      avgTime: toClock(data.stats.avg_seconds),
    },
    perQuestion: data.per_question.map((row, i) => {
      const total = row.correct + row.wrong;
      return {
        no: i + 1,
        text: data.questions[i]?.text ?? '',
        correctN: row.correct,
        wrongN: row.wrong,
        pct: total > 0 ? Math.round((row.correct / total) * 100) : 0,
      };
    }),
  };
}

// ── Прохождение теста ──────────────────────────────────────────────────────

export interface QuizStartResponse {
  /** Идентификатор попытки: с ним уходят и ответы, и завершение. */
  resultId: number;
  test: TestMeta;
  questions: QuizQuestion[];
  /** «face» включает видеонаблюдение на время теста. */
  proctoring: 'face' | 'standard';
  /** Токен для WebSocket распознавания лица; без прокторинга его нет. */
  faceWsToken: string | null;
  /** Эталонное фото студента, с которым сравнивают кадры. */
  referenceImageUrl: string | null;
}

interface ApiStartResponse {
  result_id: number;
  quiz_id: number;
  title: string;
  duration: number;
  proctoring_mode: 'face' | 'standard';
  questions: {
    id: number;
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
  }[];
  image_url: string | null;
  face_ws_token: string | null;
}

/** Заводит попытку. PIN проверяет сервер. */
export async function startTest(quizId: number, pin: string): Promise<QuizStartResponse> {
  const data = await api.post<ApiStartResponse>('/quiz_process/start_quiz', {
    quiz_id: quizId,
    pin,
  });

  return {
    resultId: data.result_id,
    test: {
      id: data.quiz_id,
      name: data.title,
      fan: '',
      oqituvchi: '',
      guruh: '',
      savollar: data.questions.length,
      davomiylik: data.duration,
      holati: 'Faol',
    },
    questions: data.questions.map((q) => ({
      // id вопроса нужен при отправке ответа — он адресуется по нему.
      id: q.id,
      text: q.text,
      image: false,
      options: [q.option_a, q.option_b, q.option_c, q.option_d].map((text, i) => ({
        letter: LETTERS[i] ?? 'A',
        text,
        image: false,
      })),
    })),
    proctoring: data.proctoring_mode,
    faceWsToken: data.face_ws_token,
    referenceImageUrl: data.image_url,
  };
}

/**
 * Отправляет один ответ. Сервер сверяет его с правильным сам — клиент
 * правильных ответов не знает и знать не должен.
 */
export const submitAnswer = (resultId: number, questionId: number, answer: string) =>
  api.post<{ question_id: number; is_correct: boolean }>('/quiz_process/submit_answer', {
    result_id: resultId,
    question_id: questionId,
    answer,
  });

interface ApiEndResponse {
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  grade: number;
}

export interface EndQuizPayload {
  cheatingDetected?: boolean;
  reason?: string;
  cheatingImageUrl?: string;
}

/** Завершает попытку и возвращает итог. Неотвеченное сервер считает ошибкой. */
export async function endTest(
  quizId: number,
  resultId: number,
  spent: number,
  extra: EndQuizPayload = {},
): Promise<QuizResult> {
  const data = await api.post<ApiEndResponse>('/quiz_process/end_quiz', {
    quiz_id: quizId,
    result_id: resultId,
    cheating_detected: extra.cheatingDetected ?? false,
    reason: extra.reason ?? null,
    cheating_image_url: extra.cheatingImageUrl ?? null,
  });

  return {
    correct: data.correct_answers,
    wrong: data.wrong_answers,
    total: data.total_questions,
    pct: data.total_questions > 0
      ? Math.round((data.correct_answers / data.total_questions) * 100)
      : 0,
    spent,
  };
}

/** Кадр с нарушением. Уходит base64 — тот же формат, что снимает камера. */
export async function uploadCheatingEvidence(
  quizId: number,
  userId: number,
  imageData: string,
): Promise<string | null> {
  const data = await api.post<{ success: boolean; image_url: string | null }>(
    '/quiz_process/upload_cheating_evidence',
    { quiz_id: quizId, user_id: userId, image_data: imageData },
  );
  return data.image_url;
}
