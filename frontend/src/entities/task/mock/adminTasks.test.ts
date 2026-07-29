import { describe, expect, it } from 'vitest';
import { buildAdminTasks, taskState } from './adminTasks';

/**
 * Эталон снят с прототипа (allTasks + genSubs). Статусы и баллы детерминированы
 * по хэшу, поэтому счётчики обязаны совпадать (см. первое задание — 13/22, 10, 3).
 */
describe('buildAdminTasks', () => {
  const tasks = buildAdminTasks();

  it('строит 30 заданий', () => {
    expect(tasks).toHaveLength(30);
  });

  it('первое задание: курс, группа, срок, число студентов', () => {
    const t = tasks[0]!;
    expect(t.fan).toBe('Oliy matematika');
    expect(t.guruh).toBe('KI-24-03');
    expect(t.oqituvchi).toBe('Bozorov D.');
    expect(t.deadline).toBe('29.07.2026');
    expect(t.students).toBe(22);
  });

  it('первое задание: 13 сдали, 10 оценено, 3 на проверке', () => {
    const t = tasks[0]!;
    const submitted = t.subs.filter((s) => s.status !== 'topshirilmagan').length;
    const graded = t.subs.filter((s) => s.status === 'baholangan').length;
    expect(submitted).toBe(13);
    expect(graded).toBe(10);
    expect(submitted - graded).toBe(3);
    expect(taskState(t)).toBe('tekshirilmoqda');
  });

  it('каждое третье задание проверено полностью', () => {
    const third = tasks[2]!;
    const pending = third.subs.filter((s) => s.status === 'topshirilgan').length;
    expect(pending).toBe(0);
  });

  it('детерминирован', () => {
    expect(buildAdminTasks()).toEqual(buildAdminTasks());
  });
});
