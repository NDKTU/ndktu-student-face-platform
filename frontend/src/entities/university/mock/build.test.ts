import { describe, expect, it } from 'vitest';
import { buildUniversity, countFacultyStudents } from './build';

/**
 * Эталонные значения сняты с оригинального прототипа: его buildData()
 * запускался в изолированном харнессе (см. tools/, раздел «Верификация» плана).
 * Порт обязан воспроизводить их байт-в-байт — иначе скриншоты разойдутся
 * с эталоном и сверка «пиксель в пиксель» потеряет смысл.
 */
describe('buildUniversity', () => {
  const uni = buildUniversity();

  it('даёт те же сводные показатели, что прототип', () => {
    expect(uni.totals).toEqual({
      faculties: 6,
      departments: 16,
      teachers: 293,
      students: 1164,
    });
  });

  it('воспроизводит первый факультет и его декана', () => {
    expect(uni.faculties[0]!.name).toBe('Konchilik fakulteti');
    expect(uni.faculties[0]!.dekan).toBe("Ergashev Sardor Muhammadali o'g'li");
  });

  it('воспроизводит первую группу', () => {
    const group = uni.faculties[0]!.kafedralar[0]!.mutaxassisliklar[0]!.guruhlar[0]!;
    expect(group.name).toBe('KI-24-03');
    expect(group.kurs).toBe(2);
    expect(group.students).toHaveLength(26);
    expect(group.student_count).toBe(26);
  });

  it('воспроизводит первого студента целиком', () => {
    const student = uni.faculties[0]!.kafedralar[0]!.mutaxassisliklar[0]!.guruhlar[0]!.students![0]!;
    expect(student).toEqual({
      id: 5000,
      gender: 'f',
      fish: 'Ochilova Sitora Muhammadali qizi',
      sid: '2024015322',
      holati: "Akademik ta'til",
      tone: 'warn',
      initials: 'OS',
    });
  });

  it('воспроизводит начало учебного плана', () => {
    const reja = uni.faculties[0]!.kafedralar[0]!.mutaxassisliklar[0]!.reja;
    expect(reja.slice(0, 3)).toEqual([
      { fan: 'Oliy matematika', semestr: 1, kredit: 5, oqituvchi: 'Bozorov D.' },
      { fan: 'Fizika', semestr: 1, kredit: 5, oqituvchi: 'Nazarova M.' },
      { fan: 'Kimyo', semestr: 1, kredit: 5, oqituvchi: 'Ergashev N.' },
    ]);
  });

  it('схлопывает каталог предметов до уникальных названий', () => {
    expect(uni.subjects).toHaveLength(119);
  });

  it('создаёт 51 группу и присваивает id в том же порядке', () => {
    const groups = uni.faculties.flatMap((f) =>
      f.kafedralar.flatMap((k) => k.mutaxassisliklar.flatMap((s) => s.guruhlar)),
    );
    expect(groups).toHaveLength(51);
    expect(uni.faculties[5]!.id).toBe(6259);
  });

  it('в каждом семестре ровно 30 кредитов', () => {
    const reja = uni.faculties[0]!.kafedralar[0]!.mutaxassisliklar[0]!.reja;
    for (let sem = 1; sem <= 8; sem++) {
      const total = reja.filter((r) => r.semestr === sem).reduce((a, r) => a + r.kredit, 0);
      expect(total, `семестр ${sem}`).toBe(30);
    }
  });

  it('детерминирован: два вызова дают одинаковый результат', () => {
    expect(buildUniversity()).toEqual(buildUniversity());
  });

  it('сумма студентов по факультетам сходится с общим числом', () => {
    const sum = uni.faculties.reduce((acc, f) => acc + countFacultyStudents(f), 0);
    expect(sum).toBe(uni.totals.students);
  });
});
