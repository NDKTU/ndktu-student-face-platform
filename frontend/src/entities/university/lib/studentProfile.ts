import type { Faculty, Group, Speciality, Student } from '../model/types';
import { hashStr, pad2, translit } from '../mock/rng';

/**
 * Развёрнутая анкета студента. Источник для сида: значения выводятся
 * детерминированно из хэша студенческого ID, а в БД уезжают как данные
 * (см. tools/export-seed.ts). Экраны берут анкету из API, а не отсюда.
 */
export interface SeedStudentProfile {
  birth: string;
  email: string;
  lang: string;
  eduType: string;
  semestr: string;
  kursLevel: string;
  pay: string;
  /** Персональные данные — показываются не всем ролям. */
  jshshir: string;
  country: string;
  vil: string;
  tum: string;
  address: string;
  soc: string;
  pov: string;
}

const LANGS = ['Oʻzbek', 'Oʻzbek', 'Oʻzbek', 'Oʻzbek', 'Rus', 'Ingliz'];
const REGIONS = ['Navoiy', 'Buxoro', 'Samarqand', 'Qashqadaryo', 'Jizzax', 'Xorazm'];
const DISTRICTS = ['Konimex', 'Karmana', 'Nurota', 'Xatirchi', 'Tomdi', 'Qiziltepa'];
const STREETS = [
  'Navoiy koʻchasi',
  'Doʻstlik koʻchasi',
  'Istiqlol koʻchasi',
  'Bunyodkor koʻchasi',
  'Fitrat koʻchasi',
];
const SOCIAL = [
  'Oddiy', 'Oddiy', 'Oddiy', 'Oddiy',
  'Kam taʼminlangan oila', 'Temir daftar', 'Nogironligi bor', 'Yetim, vasiylikda',
];
const POVERTY = ['Past', 'Oʻrta', 'Yuqori'];

/** Достаточный вход для анкеты — реестр студентов хранит плоские строки, а не Student. */
type ProfileSubject = Pick<Student, 'sid' | 'fish' | 'gender'>;

/**
 * Источник записи: синхронизация HEMIS или заведена вручную. Признака в
 * генераторе нет, поэтому выводится из хэша студенческого ID — значение
 * стабильно, и сид кладёт в БД именно его.
 */
export function studentSource(sid: string): 'HEMIS' | "Qo'lda" {
  return hashStr(`src${sid}`) % 3 === 0 ? 'HEMIS' : "Qo'lda";
}

export function buildStudentProfile(
  student: ProfileSubject,
  group: Pick<Group, 'kurs'>,
): SeedStudentProfile {
  const h = hashStr(`stu${student.sid}`);
  const kurs = group.kurs;

  const year = 2025 - 17 - kurs - (h % 2);
  const month = 1 + (h % 12);
  const day = 1 + (h % 27);

  const [first = '', last = ''] = student.fish.split(' ');
  const email = `${translit(first)}.${translit(last)}${String(student.sid).slice(-3)}@student.ndktu.uz`;

  const soc = SOCIAL[h % SOCIAL.length]!;
  const genderDigit = student.gender === 'm' ? 5 : 6;

  return {
    birth: `${pad2(day)}.${pad2(month)}.${year}`,
    email,
    lang: LANGS[h % LANGS.length]!,
    eduType: 'Bakalavr',
    semestr: `${kurs * 2}-semestr`,
    kursLevel: `${kurs}-kurs`,
    pay: h % 10 < 3 ? 'Davlat granti' : 'Toʻlov-shartnoma',
    jshshir: `${genderDigit}${pad2(day)}${pad2(month)}${String(year).slice(2)}${String(
      1000000 + (h % 8999999),
    ).slice(0, 7)}`,
    country: 'Oʻzbekiston',
    vil: `${REGIONS[h % REGIONS.length]!} viloyati`,
    tum: `${DISTRICTS[(h >>> 2) % DISTRICTS.length]!} tumani`,
    address: `${STREETS[(h >>> 3) % STREETS.length]!}, ${1 + (h % 140)}-uy, ${1 + (h % 80)}-xonadon`,
    soc,
    pov: soc === 'Oddiy' ? 'Yoʻq' : POVERTY[(h >>> 4) % POVERTY.length]!,
  };
}

/** Цвета бейджа статуса студента. */
export function statusTone(tone: Student['tone']) {
  if (tone === 'ok') return { bg: '#EDF7EE', fg: '#157A43', dot: '#22A560' };
  if (tone === 'warn') return { bg: '#FBF3E2', fg: '#B45309', dot: '#D08700' };
  return { bg: '#F1F2F7', fg: '#6B6E82', dot: '#9498AD' };
}

export interface StudentContext {
  group: Group;
  speciality: Speciality;
  faculty: Faculty;
}
