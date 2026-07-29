import { describe, expect, it } from 'vitest';
import { buildCourse } from './buildCourse';

/**
 * Эталон снят с прототипа (buildCourse на mulberry32). Курс детерминирован
 * по названию предмета, поэтому эти значения фиксированы.
 */
describe('buildCourse', () => {
  const course = buildCourse('Kon jinslari mexanikasi', 'Jasur Bozorov', 2);

  it('строит шесть тем и 23 урока', () => {
    expect(course.mavzular).toHaveLength(6);
    expect(course.total).toBe(23);
    expect(course.doneCount).toBe(17);
  });

  it('воспроизводит первую тему и первый урок', () => {
    const topic = course.mavzular[0]!;
    expect(topic.title).toBe('Kirish va asosiy tushunchalar');
    expect(topic.darslar).toHaveLength(3);

    const lesson = topic.darslar[0]!;
    expect(lesson.title).toBe('Nazariy kirish');
    expect(lesson.videoType).toBe('upload');
    expect(lesson.dur).toBe('42 daq');
    expect(lesson.done).toBe(true);
    expect(lesson.uy?.deadline).toBe('24.07.2026');
    expect(lesson.resurslar).toHaveLength(3);
  });

  it('deterministичен: два вызова совпадают', () => {
    expect(buildCourse('Oliy matematika', 'X', 1)).toEqual(buildCourse('Oliy matematika', 'X', 1));
  });

  it('пройденные уроки идут подряд с начала', () => {
    const flat = course.mavzular.flatMap((m) => m.darslar);
    const doneCount = flat.filter((d) => d.done).length;
    expect(doneCount).toBe(course.doneCount);
    // Все done=true должны предшествовать первому done=false.
    const firstUndone = flat.findIndex((d) => !d.done);
    expect(flat.slice(0, firstUndone).every((d) => d.done)).toBe(true);
  });
});
