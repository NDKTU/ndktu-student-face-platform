import type { QuizQuestion, TestMeta } from '../model/types';

/** Тесты, доступные студенту DI-24-01. */
export const STUDENT_TESTS: TestMeta[] = [
  { id: 1, name: 'Oliy matematika — 2025/2026 — 2-semestr', fan: 'Oliy matematika', oqituvchi: 'Jasur Bozorov', davomiylik: 30, savollar: 20, holati: 'Faol', guruh: 'DI-24-01' },
  { id: 2, name: 'Informatika va axborot texnologiyalari — 2025/2026 — 1-semestr', fan: 'Informatika va axborot texnologiyalari', oqituvchi: 'Sherzod Rustamov', davomiylik: 25, savollar: 15, holati: 'Faol', guruh: 'DI-24-01' },
  { id: 3, name: 'Fizika — 2025/2026 — 1-semestr', fan: 'Fizika', oqituvchi: 'Malika Yusupova', davomiylik: 40, savollar: 25, holati: 'Faol', guruh: 'DI-24-01' },
  { id: 4, name: 'Kimyo — 2025/2026 — 1-semestr', fan: 'Kimyo', oqituvchi: 'Nodira Karimova', davomiylik: 30, savollar: 20, holati: 'Yopiq', guruh: 'DI-24-01' },
  { id: 5, name: 'Diskret matematika — 2025/2026 — 2-semestr', fan: 'Diskret matematika', oqituvchi: 'Otabek Saidov', davomiylik: 30, savollar: 20, holati: 'Faol', guruh: 'DI-24-02' },
];

/** Тесты преподавателя Jasur Bozorov. */
export const TEACHER_TESTS: TestMeta[] = [
  { id: 1, name: 'Kon jinslari mexanikasi — 2025/2026 — 2-semestr', fan: 'Kon jinslari mexanikasi', oqituvchi: 'Jasur Bozorov', guruh: 'KI-24-01', savollar: 25, davomiylik: 30, holati: 'Faol', pin: '482913' },
  { id: 2, name: 'Portlatish ishlari texnologiyasi — 2025/2026 — 1-semestr', fan: 'Portlatish ishlari texnologiyasi', oqituvchi: 'Jasur Bozorov', guruh: 'KI-23-01', savollar: 20, davomiylik: 40, holati: 'Faol', pin: '305178' },
  { id: 3, name: 'Oliy matematika — 2025/2026 — 2-semestr', fan: 'Oliy matematika', oqituvchi: 'Jasur Bozorov', guruh: 'KI-24-02', savollar: 20, davomiylik: 30, holati: 'Yopilgan', pin: '774120' },
];

/** Предметы преподавателя — для формы создания теста. */
export const TEACHER_TEST_SUBJECTS = [
  { id: 'ts1', fan: 'Kon jinslari mexanikasi', count: 45 },
  { id: 'ts2', fan: 'Portlatish ishlari texnologiyasi', count: 27 },
  { id: 'ts3', fan: 'Kon aerologiyasi va ventilyatsiya', count: 19 },
  { id: 'ts4', fan: 'Oliy matematika', count: 38 },
] as const;

const GENERIC_TOPICS = [
  'asosiy tushuncha', "taʼrif", 'formula', "oʻlchov birligi", 'xossa',
  'qonuniyat', 'usul', 'tatbiq', 'klassifikatsiya', 'tamoyil',
];

const OPTIONS = [
  'Tajribaviy usulda aniqlanadi', "Nazariy hisoblash yoʻli bilan", "Standart jadval boʻyicha",
  'Modellashtirish orqali', "Bevosita oʻlchash bilan", 'Empirik formula asosida',
  'Grafik usulda', 'Taqqoslash orqali',
];

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const TEMPLATES: ((t: string) => string)[] = [
  (t) => `${capitalize(t)} qanday aniqlanadi?`,
  (t) => `Quyidagilardan qaysi biri ${t}ga taalluqli?`,
  (t) => `${capitalize(t)} nima?`,
  (t) => `${capitalize(t)}ning birligi qaysi?`,
  (t) => `Qaysi holatda ${t} ortadi?`,
];

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * Собирает вопросы теста. Полностью детерминирован: индекс верного ответа
 * и наличие картинки задаются арифметикой от номера вопроса, без RNG.
 * Совпадает с genQuiz прототипа.
 */
export function buildQuiz(fan: string, count: number): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const topic = GENERIC_TOPICS[i % GENERIC_TOPICS.length]!;
    const correct = (i * 3 + 1) % 4;
    const hasOptionImage = i % 7 === 0;

    questions.push({
      text: `${fan} — ${TEMPLATES[i % TEMPLATES.length]!(topic)}`,
      image: i % 9 === 0,
      correct,
      options: [0, 1, 2, 3].map((k) => ({
        letter: LETTERS[k]!,
        text: OPTIONS[(i + k) % OPTIONS.length]!,
        image: hasOptionImage && k === 1,
      })),
    });
  }
  return questions;
}

/** Форматирует секунды в MM:SS. */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds | 0);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Генерирует 6-значный PIN. */
export function generatePin(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}
