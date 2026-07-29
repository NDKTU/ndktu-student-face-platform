import { describe, expect, it } from 'vitest';
import { buildUniversity } from '@/entities/university/mock/build';

/**
 * Эталон снят с прототипа тем же способом, что и структура университета.
 * Анкеты выводятся из хэша ФИО, поэтому расхождение здесь означает,
 * что разъехался либо хэш, либо порядок построения записей.
 */
describe('buildEmployees', () => {
  const { directory } = buildUniversity();

  it('показывает 16 записей', () => {
    expect(directory.employees).toHaveLength(16);
  });

  it('порядок ролей совпадает с прототипом', () => {
    expect(directory.employees.map((e) => e.roleNames[0])).toEqual([
      'super_admin', 'admin',
      'dekan', 'dekan', 'dekan', 'dekan', 'dekan', 'dekan',
      'kafedra_mudiri', 'kafedra_mudiri', 'kafedra_mudiri', 'kafedra_mudiri',
      'oqituvchi', 'oqituvchi', 'oqituvchi',
      'talaba',
    ]);
  });

  it('воспроизводит первую запись целиком', () => {
    expect(directory.employees[0]).toEqual({
      id: 6260,
      fish: 'Sardor Aliyev',
      userId: 6260,
      roleNames: ['super_admin'],
      role: 'Super Admin',
      unit: 'Rektorat',
      lavozim: 'Tizim administratori',
      holati: 'Faol',
      email: 'a.sardor@ndktu.uz',
      workEmail: 'a.sardor@ndktu.uz',
      login: 'a.sardor',
      initials: 'SA',
      color: '#2836C7',
      gender: 'Erkak',
      birth: '25.07.1998',
      hire: '20.04.2023',
      lastLogin: '18.07.2026 18:54',
      workPhone: '+998 96 526-47-11',
      personalPhone: '+998 91 206-05-26',
      jshshir: '36980725169694',
      passport: 'AY 8169694',
      address: 'Navoiy shahri, Navoiy shoh koʻchasi, 15-uy, 25-xonadon',
    });
  });

  it('последняя запись — студент, под которым выполняется вход', () => {
    const last = directory.employees.at(-1)!;
    expect(last.id).toBe(6275);
    expect(last.fish).toBe("Abdullayev Islom Sardor o'g'li");
    expect(last.roleNames[0]).toBe('talaba');
    expect(last.unit).toBe('DI-24-01');
  });

  it('один преподаватель заблокирован', () => {
    const blocked = directory.employees.filter((e) => e.holati === 'Bloklangan');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.unit).toBe('Iqtisodiyot kafedrasi');
  });

  it('справочник подразделений содержит 18 вариантов', () => {
    expect(directory.units).toHaveLength(18);
    expect(directory.units[0]).toBe('Rektorat');
  });

  it('студента нельзя назначить сотруднику', () => {
    expect(directory.assignableRoles.map((r) => r.id)).not.toContain('talaba');
    expect(directory.assignableRoles).toHaveLength(5);
  });
});
