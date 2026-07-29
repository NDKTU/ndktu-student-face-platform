import { hashStr } from '@/entities/university/mock/rng';
import type { Question, QuestionOption } from '../model/types';

export type { Question, QuestionOption } from '../model/types';

/**
 * Тематики банка вопросов преподавателя. Ключи — id предметов преподавателя.
 */
export const TEACHER_QUESTION_TOPICS: Record<string, string[]> = {
  ts1: ['kuchlanish', 'deformatsiya', 'mustahkamlik chegarasi', 'elastiklik moduli', "gʻovaklik", 'zichlik', 'siljish moduli', 'yorilish'],
  ts2: ['portlovchi modda', 'portlash energiyasi', 'shpur zaryadi', 'detonatsiya', "portlash toʻlqini", 'sekinlashtirish', 'xavfsizlik zonasi', 'zaryad massasi'],
  ts3: ['havo sarfi', 'ventilyatsiya', 'metan konsentratsiyasi', 'depressiya', 'shamollatish sxemasi', 'aerodinamik qarshilik', 'changlanish', 'kislorod balansi'],
  ts4: ['hosila', 'integral', 'limit', 'matritsa', 'determinant', 'vektor', 'differensial tenglama', 'ehtimollik'],
};

/** Универсальные тематики для предметов из общего каталога. */
export const GENERIC_QUESTION_TOPICS = [
  'asosiy tushuncha',
  "taʼrif",
  'formula',
  "oʻlchov birligi",
  'klassifikatsiya',
  'xossa',
  'qonuniyat',
  'tatbiq',
];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Шаблоны формулировок вопроса от тематики. */
const TEMPLATES: ((t: string) => string)[] = [
  (t) => `${capitalize(t)} qanday aniqlanadi?`,
  (t) => `Quyidagilardan qaysi biri ${t}ga taalluqli?`,
  (t) => `${capitalize(t)}ning oʻlchov birligi qaysi?`,
  (t) => `${capitalize(t)} qaysi omilga bogʻliq?`,
  (t) => `${capitalize(t)} formulasi toʻgʻri koʻrsatilgan qatorni toping.`,
  (t) => `Qaysi holatda ${t} ortadi?`,
  (t) => `${capitalize(t)} taʼrifini toping.`,
  (t) => `${capitalize(t)} bilan bogʻliq jarayon qaysi?`,
];

const OPTIONS = [
  'Tajribaviy usulda aniqlanadi',
  "Nazariy hisoblash yoʻli bilan",
  "Standart jadval boʻyicha",
  'Modellashtirish orqali',
  "Bevosita oʻlchash bilan",
  'Empirik formula asosida',
  'Grafik usulda',
  'Taqqoslash orqali',
];

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Генерирует банк вопросов для предмета.
 *
 * ОТЛИЧИЕ ОТ ПРОТОТИПА: там индекс правильного ответа берётся из общего LCG,
 * то есть зависит от всего порядка построения данных. Здесь seed берётся
 * от id предмета — вопросы стабильны и не зависят от порядка. Формулировки,
 * варианты и доля картинок совпадают с прототипом; конкретная буква верного
 * ответа может отличаться, но это процедурный филлер без эталонного значения.
 */
export function buildQuestions(subjectId: string, count: number, topics: string[]): Question[] {
  const rnd = mulberry32(hashStr(`qbank:${subjectId}`));
  const questions: Question[] = [];

  for (let i = 0; i < count; i++) {
    const topic = topics[i % topics.length]!;
    const template = TEMPLATES[(i + Math.floor(i / topics.length)) % TEMPLATES.length]!;
    const correctIndex = Math.floor(rnd() * 4);
    const hasImage = rnd() < 0.16;

    const options: QuestionOption[] = [0, 1, 2, 3].map((k) => ({
      letter: LETTERS[k]!,
      text: OPTIONS[(i + k) % OPTIONS.length]!,
      image: hasImage && k === correctIndex,
      correct: k === correctIndex,
    }));

    questions.push({
      id: i,
      subjectId,
      text: template(topic),
      correct: LETTERS[correctIndex]!,
      hasImage,
      options,
    });
  }

  return questions;
}

/** Предметы преподавателя — источник вкладок в банке вопросов. */
export const TEACHER_SUBJECTS = [
  { id: 'ts1', fan: 'Kon jinslari mexanikasi', count: 45 },
  { id: 'ts2', fan: 'Portlatish ishlari texnologiyasi', count: 27 },
  { id: 'ts3', fan: 'Kon aerologiyasi va ventilyatsiya', count: 19 },
  { id: 'ts4', fan: 'Oliy matematika', count: 38 },
] as const;
