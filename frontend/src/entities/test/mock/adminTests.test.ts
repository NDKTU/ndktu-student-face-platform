import { describe, expect, it } from 'vitest';
import { ADMIN_TESTS, buildTestDetail } from './adminTests';

/**
 * Эталон снят с прототипа (buildTestDetail для tst0). Локальный LCG с seed
 * от id теста делает аналитику воспроизводимой — числа обязаны совпадать.
 */
describe('buildTestDetail', () => {
  const first = ADMIN_TESTS[0]!; // Kon jinslari mexanikasi, 25 вопросов, 30 мин

  it('первый админ-тест: имя, PIN, группа', () => {
    expect(first.name).toBe('Kon jinslari mexanikasi — 2025/2026 — 1-semestr');
    expect(first.pin).toBe('100000');
    expect(first.guruh).toBe('KI-24-01');
  });

  it('сводные показатели совпадают с эталоном', () => {
    const { stats } = buildTestDetail(first);
    expect(stats).toMatchObject({
      submitted: 18,
      total: 26,
      avg: 71,
      max: '22/25',
      min: '13/25',
      avgTime: '19:43',
    });
  });

  it('первая попытка совпадает с эталоном', () => {
    const { students } = buildTestDetail(first);
    expect(students[0]).toMatchObject({ ball: 18, total: 25, pct: 72, time: '22:53' });
  });

  it('разбор по вопросам покрывает все вопросы, correct+wrong = число сдавших', () => {
    const detail = buildTestDetail(first);
    expect(detail.perQuestion).toHaveLength(25);
    detail.perQuestion.forEach((q) => {
      expect(q.correctN + q.wrongN).toBe(detail.stats.submitted);
    });
  });

  it('детерминирован', () => {
    expect(buildTestDetail(first)).toEqual(buildTestDetail(first));
  });
});
