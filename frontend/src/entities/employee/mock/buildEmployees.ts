import type { Role } from '@/entities/access/model/roles';
import { ROLE_COLORS } from '@/entities/access/model/roles';
import type { Faculty, Person } from '@/entities/university/model/types';
import { Rng, hashStr, initials, pad2, translit } from '@/entities/university/mock/rng';
import type { Employee, EmployeeSensitive, EmployeeStatus } from '../model/types';

/**
 * Анкета целиком, вместе с персональными данными. Экраны такого типа больше
 * не видят: этот генератор остался источником для сида (tools/export-users.ts),
 * а карточка запрашивает персональный блок отдельно.
 */
export type SeedEmployee = Employee & EmployeeSensitive;

/** Должность по умолчанию для каждой роли. */
const POSITIONS: Record<Role, string> = {
  super_admin: 'Tizim administratori',
  admin: 'Administrator',
  dekan: 'Dekan',
  kafedra_mudiri: 'Kafedra mudiri',
  oqituvchi: "Katta o'qituvchi",
  talaba: 'Talaba',
};

/** Отображаемое название роли в таблице сотрудников. */
const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrator',
  dekan: 'Dekan',
  kafedra_mudiri: 'Kafedra mudiri',
  oqituvchi: "O'qituvchi",
  talaba: 'Talaba',
};

const STREETS = [
  'Navoiy shoh koʻchasi',
  "G'alaba koʻchasi",
  'Alisher Navoiy koʻchasi',
  'Ibn Sino koʻchasi',
  'Bunyodkor koʻchasi',
  'Fitrat koʻchasi',
];

/** Прототип показывает первые 16 записей. */
const VISIBLE_LIMIT = 16;

/**
 * Анкета сотрудника выводится из хэша ФИО, а не из RNG: она должна быть
 * одинаковой независимо от того, в каком порядке строились записи.
 * Единственное, что берётся из общего счётчика — id.
 */
function makeEmployee(
  rng: Rng,
  fish: string,
  roleId: Role,
  unit: string,
  holati: EmployeeStatus = 'Faol',
): SeedEmployee {
  const h = hashStr(`emp${fish}`);
  const male = h % 2 === 0;

  const parts = fish.split(' ');
  const lastName = translit(parts[1] || fish);
  const firstName = translit(parts[0] ?? '');
  const login = `${lastName[0] ?? 'x'}.${firstName}`;

  const birthYear = 1968 + (h % 34);
  const birthMonth = 1 + (h % 12);
  const birthDay = 1 + (h % 27);
  const hireYear = 2009 + (h % 16);
  // Только беззнаковый сдвиг: hashStr отдаёт 32-битное беззнаковое число, и
  // «>>» на значениях от 2^31 уводил результат в минус — половина сотрудников
  // получала даты вида «-15.-9.2013» и телефоны «+998 83 -307--29--83».
  const hireMonth = 1 + ((h >>> 3) % 12);
  const hireDay = 1 + ((h >>> 2) % 27);

  return {
    id: rng.uid(),
    fish,
    roleId,
    role: ROLE_LABELS[roleId],
    unit,
    lavozim: POSITIONS[roleId],
    holati,
    email: `${login}@ndktu.uz`,
    workEmail: `${login}@ndktu.uz`,
    login,
    initials: initials(fish),
    color: ROLE_COLORS[roleId],

    gender: male ? 'Erkak' : 'Ayol',
    birth: `${pad2(birthDay)}.${pad2(birthMonth)}.${birthYear}`,
    hire: `${pad2(hireDay)}.${pad2(hireMonth)}.${hireYear}`,
    lastLogin: `18.07.2026 ${pad2(8 + (h % 11))}:${pad2(h % 60)}`,

    workPhone: `+998 ${90 + (h % 9)} ${100 + (h % 899)}-${pad2((h >>> 1) % 100)}-${pad2((h >>> 3) % 100)}`,
    personalPhone: `+998 ${90 + ((h >>> 2) % 9)} ${100 + ((h >>> 2) % 899)}-${pad2((h >>> 4) % 100)}-${pad2((h >>> 6) % 100)}`,
    jshshir: String(
      30000000000000 +
        (h % 9) * 1000000000000 +
        (birthYear % 100) * 10000000000 +
        birthMonth * 100000000 +
        birthDay * 1000000 +
        (h % 1000000),
    ).slice(0, 14),
    passport: `A${String.fromCharCode(65 + (h % 26))} ${String(1000000 + (h % 9000000))}`,
    address: `Navoiy shahri, ${STREETS[h % STREETS.length]!}, ${1 + (h % 140)}-uy, ${1 + (h % 90)}-xonadon`,
  };
}

export interface EmployeeDirectory {
  employees: SeedEmployee[];
  /** Варианты подразделения для формы. */
  units: string[];
  /** Роли, которые можно назначить сотруднику — студента здесь нет. */
  assignableRoles: { id: Role; label: string }[];
}

/**
 * Строит справочник сотрудников. Порядок обращений к RNG обязан совпадать
 * с прототипом: id выдаются из того же счётчика, что и сущности структуры,
 * а трое преподавателей генерируются случайными именами.
 */
export function buildEmployees(rng: Rng, faculties: Faculty[], me: Person): EmployeeDirectory {
  const employees: SeedEmployee[] = [
    makeEmployee(rng, 'Sardor Aliyev', 'super_admin', 'Rektorat'),
    makeEmployee(rng, 'Nodira Karimova', 'admin', 'Boshqaruv'),
  ];

  faculties.forEach((f) => employees.push(makeEmployee(rng, f.dekan, 'dekan', f.name)));

  // Заведующие только у первых четырёх факультетов — так в прототипе.
  faculties.slice(0, 4).forEach((f) => {
    const department = f.kafedralar[0]!;
    employees.push(makeEmployee(rng, department.mudir, 'kafedra_mudiri', department.name));
  });

  employees.push(makeEmployee(rng, rng.person().full, 'oqituvchi', 'Dasturiy injiniring kafedrasi'));
  employees.push(makeEmployee(rng, rng.person().full, 'oqituvchi', 'Metallurgiya kafedrasi'));
  employees.push(
    makeEmployee(rng, rng.person().full, 'oqituvchi', 'Iqtisodiyot kafedrasi', 'Bloklangan'),
  );
  employees.push(makeEmployee(rng, me.full, 'talaba', 'DI-24-01'));

  const units = [
    ...new Set(
      ['Rektorat', "O'quv boshqarmasi"].concat(
        faculties.flatMap((f) => f.kafedralar.map((k) => k.name)),
      ),
    ),
  ];

  return {
    employees: employees.slice(0, VISIBLE_LIMIT),
    units,
    assignableRoles: (['super_admin', 'admin', 'dekan', 'kafedra_mudiri', 'oqituvchi'] as const).map(
      (id) => ({ id, label: ROLE_LABELS[id] }),
    ),
  };
}
