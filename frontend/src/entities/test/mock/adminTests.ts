import { hashStr, initials } from '@/entities/university/mock/rng';
import { buildQuiz, formatTime } from './tests';
import type {
  QuestionStat,
  StudentAttempt,
  TestDetailData,
  TestMeta,
} from '../model/types';

/**
 * Тесты для админ-модуля (super_admin / admin) — из tseed прототипа.
 * name = «{fan} — 2025/2026 — {semestr}-semestr», pin детерминирован по индексу.
 */
const TSEED: [string, string, string, number, number, TestMeta['holati']][] = [
  ['Kon jinslari mexanikasi', 'Jasur Bozorov', 'KI-24-01', 25, 30, 'Faol'],
  ['Metallurgiya nazariyasi', 'Malika Yusupova', 'MT-23-01', 20, 40, 'Faol'],
  ['Dasturlash asoslari', 'Sherzod Rustamov', 'DI-24-02', 30, 45, 'Yopiq'],
  ['Elektr mashinalari', 'Nodira Karimova', 'EE-23-01', 15, 25, 'Faol'],
  ['Oliy matematika', 'Jasur Bozorov', 'KI-24-02', 20, 30, 'Faol'],
  ['Geodeziya asoslari', 'Otabek Saidov', 'GD-24-01', 18, 35, 'Yopiq'],
  ['Buxgalteriya hisobi', 'Feruza Tursunova', 'IQ-23-01', 25, 50, 'Faol'],
  ['Portlatish ishlari texnologiyasi', 'Jasur Bozorov', 'KI-23-01', 22, 30, 'Faol'],
];

export const ADMIN_TESTS: TestMeta[] = TSEED.map((t, i) => ({
  // Нумерация с нуля не случайна: id сеет RNG аналитики (см. buildTestDetail),
  // а эталонные числа прототипа считались от «tst0» → 0.
  id: i,
  name: `${t[0]} — 2025/2026 — ${1 + (i % 8)}-semestr`,
  fan: t[0],
  oqituvchi: t[1],
  guruh: t[2],
  savollar: t[3],
  davomiylik: t[4],
  holati: t[5],
  pin: String(100000 + ((i * 137641) % 900000)),
}));

// Типы переехали в model/types.ts: их отдаёт бэкенд, а не только этот генератор.
export type { QuestionStat, StudentAttempt, TestDetailData } from '../model/types';

// Имена попыток. В прототипе они шли из общего RNG (зависят от порядка);
// здесь берутся детерминированно по хэшу id попытки — порядок не важен.
// Пол выбирается по хэшу, имя/фамилия/суффикс согласованы с ним.
const MALE_FIRST = ['Kamron', 'Bekzod', 'Aziz', 'Diyor', 'Sardor', 'Jasur', 'Otabek', 'Sherzod'];
const FEMALE_FIRST = ['Gulbahor', 'Malika', 'Sabina', 'Madina', 'Nilufar', 'Feruza', 'Sevara', 'Dilnoza'];
const SURNAME = ['Umarov', 'Xolmatov', 'Yoldoshev', 'Karimov', 'Jorayev', 'Rustamov', 'Saidov', 'Abdullayev'];

function attemptName(seed: string): string {
  // Беззнаковый сдвиг: hashStr даёт uint32, а `>>` трактует его как int32
  // и для больших значений уходит в минус → отрицательный индекс массива.
  const h = hashStr(seed);
  const female = h % 2 === 0;
  const first = (female ? FEMALE_FIRST : MALE_FIRST)[h % 8]!;
  const surnameBase = SURNAME[(h >>> 3) % SURNAME.length]!;
  const surname = female ? `${surnameBase}a` : surnameBase;
  const father = MALE_FIRST[(h >>> 5) % MALE_FIRST.length]!;
  return `${surname} ${first} ${father}${female ? ' qizi' : " o'g'li"}`;
}

/**
 * Аналитика теста: попытки студентов, сводные показатели, разбор по вопросам.
 * Порт buildTestDetail прототипа — тот же локальный LCG (seed от id теста),
 * поэтому показатели воспроизводятся точь-в-точь (18/26, 71%, 22/25, 13/25, 19:43…).
 */
export function buildTestDetail(test: TestMeta): TestDetailData {
  const questions = buildQuiz(test.fan, test.savollar);
  const N = 26;
  const submittedCount = 18;

  // Зерно из id теста: раньше его выковыривали регуляркой из «tst3».
  let sd = ((test.id || 7) * 97 + 31) & 0x7fffffff;
  const rnd = () => {
    sd = (sd * 1103515245 + 12345) & 0x7fffffff;
    return sd / 0x7fffffff;
  };

  const students: StudentAttempt[] = [];
  for (let i = 0; i < N; i++) {
    const submitted = i < submittedCount;
    const answers: Record<number, number> = {};
    let correct = 0;

    if (submitted) {
      questions.forEach((q, qi) => {
        // buildQuiz всегда проставляет correct; в типе он опционален, потому
        // что при прохождении теста сервер верный вариант не присылает.
        const right = q.correct ?? 0;
        const good = rnd() < 0.72;
        const choice = good ? right : (right + 1 + Math.floor(rnd() * 3)) % 4;
        answers[qi] = choice;
        if (choice === right) correct++;
      });
    }

    const total = questions.length;
    const secs = submitted ? Math.round(test.davomiylik * 60 * (0.4 + rnd() * 0.5)) : 0;
    const name = attemptName(`${test.id}_st${i}`);

    students.push({
      // Нумерация с нуля не случайна: id сеет RNG аналитики (см. buildTestDetail),
  // а эталонные числа прототипа считались от «tst0» → 0.
  id: i,
      fish: name,
      initials: initials(name),
      submitted,
      answers,
      ball: correct,
      total,
      pct: submitted ? Math.round((correct / total) * 100) : 0,
      time: submitted ? formatTime(secs) : '—',
      secsN: secs,
      sana: submitted ? '14.06.2026' : '',
    });
  }

  const subs = students.filter((s) => s.submitted);
  const avg = subs.length ? Math.round(subs.reduce((a, s) => a + s.pct, 0) / subs.length) : 0;
  const max = subs.length ? Math.max(...subs.map((s) => s.ball)) : 0;
  const min = subs.length ? Math.min(...subs.map((s) => s.ball)) : 0;
  const avgSecs = subs.length ? Math.round(subs.reduce((a, s) => a + s.secsN, 0) / subs.length) : 0;

  const perQuestion: QuestionStat[] = questions.map((q, qi) => {
    let c = 0;
    subs.forEach((s) => {
      if (s.answers[qi] === q.correct) c++;
    });
    return {
      no: qi + 1,
      text: q.text,
      correctN: c,
      wrongN: subs.length - c,
      pct: subs.length ? Math.round((c / subs.length) * 100) : 0,
    };
  });

  return {
    questions,
    students,
    stats: {
      submitted: subs.length,
      total: N,
      avg,
      max: `${max}/${questions.length}`,
      min: `${min}/${questions.length}`,
      avgTime: formatTime(avgSecs),
    },
    perQuestion,
  };
}
