import { describe, expect, it } from 'vitest';
import { buildStudentTasks } from './studentTasks';

/** Эталон снят с прототипа (myTasks для студента DI-24-01). */
describe('buildStudentTasks', () => {
  const tasks = buildStudentTasks();

  it('строит 12 заданий', () => {
    expect(tasks).toHaveLength(12);
  });

  it('первое задание — по дифференциальным уравнениям, сдано', () => {
    expect(tasks[0]).toMatchObject({
      id: 1,
      fan: 'Differensial tenglamalar',
      title: 'Nazariy kirish',
      deadline: '29.07.2026',
      status: 'topshirilgan',
      ball: null,
    });
  });

  it('статусы циклятся сдано→не сдано→просрочено→оценено', () => {
    expect(tasks.slice(0, 4).map((t) => t.status)).toEqual([
      'topshirilgan',
      'topshirilmagan',
      'kechikkan',
      'baholangan',
    ]);
  });

  it('у оценённых заданий есть балл и отзыв', () => {
    const graded = tasks.filter((t) => t.status === 'baholangan');
    expect(graded.length).toBeGreaterThan(0);
    graded.forEach((t) => {
      expect(t.ball).toBeGreaterThanOrEqual(70);
      expect(t.feedback).not.toBe('');
    });
  });

  it('детерминирован', () => {
    expect(buildStudentTasks()).toEqual(buildStudentTasks());
  });
});
