import type {
  StudentProfile,
  StudentRow,
  StudentSensitive,
} from '@/entities/student/model/types';
import type { StatusTone, StudentStatus } from '@/entities/university/model/types';
import { initials } from '@/shared/lib/initials';
import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для реестра студентов.
 *
 * Создания здесь нет намеренно: студентов заводит синхронизация с HEMIS
 * (`POST /hemis/sync`), эндпоинта на ручное создание у бэкенда нет вовсе.
 * Форма «Yangi talaba» из прототипа поэтому убрана, а не оставлена нерабочей.
 */

interface ApiStudent {
  id: number;
  full_name: string;
  student_id_number: string;
  gender: string;
  phone: string | null;
  birth_date: string;
  faculty: string;
  specialty: string;
  level: string;
  semester: string;
  student_status: string;
  education_form: string;
  education_type: string;
  education_lang: string;
  payment_form: string;
  address: string;
  avg_gpa: number;
  group: { id: number; name: string } | null;
  user: { id: number; username: string } | null;
}

interface ApiStudentSensitive {
  id: number;
  jshshir: string | null;
  passport: string | null;
  region: string | null;
  district: string | null;
  address: string | null;
  social_category: string | null;
  benefit: string | null;
}

/** Статусы на бэкенде — свободные строки; в бейдже у них три цвета. */
function statusOf(raw: string): { holati: StudentStatus; tone: StatusTone } {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('akademik')) return { holati: "Akademik ta'til", tone: 'warn' };
  if (value.includes("ta'til") || value.includes('tatil')) return { holati: "Ta'til", tone: 'muted' };
  return { holati: 'Faol', tone: 'ok' };
}

/** «2» или «2-kurs» — в данных HEMIS встречаются оба варианта. */
function kursOf(level: string): number {
  const parsed = Number.parseInt(level ?? '', 10);
  return Number.isNaN(parsed) ? 1 : parsed;
}

function toRow(student: ApiStudent): StudentRow {
  const { holati, tone } = statusOf(student.student_status);
  return {
    id: student.id,
    fish: student.full_name,
    login: student.user?.username ?? '',
    gender: student.gender === 'f' || student.gender?.toLowerCase().startsWith('a') ? 'f' : 'm',
    sid: student.student_id_number ?? '',
    guruh: student.group?.name ?? '',
    fakultet: student.faculty ?? '',
    mutaxassislik: student.specialty ?? '',
    kurs: kursOf(student.level),
    shakl: student.education_form ?? '',
    holati,
    tone,
    initials: initials(student.full_name),
    // Ручного заведения нет — всё, что есть в реестре, пришло из HEMIS.
    manba: 'HEMIS',
  };
}

/**
 * Реестр целиком. Пагинации на экране нет, а строк на реальных данных больше
 * тысячи — берём крупными страницами. Это осознанный компромисс: серверный
 * поиск и своя пагинация сюда ещё не приехали.
 */
export async function getStudents(): Promise<StudentRow[]> {
  const students = await getAll<ApiStudent>('/students/', 'students', {}, 500);
  return students.map(toRow);
}

/** Вкладка «Umumiy» карточки студента. */
export async function getStudentProfile(id: number): Promise<StudentProfile> {
  const student = await api.get<ApiStudent>(`/students/${id}`);
  return {
    birth: student.birth_date ?? '',
    login: student.user?.username ?? '',
    phone: student.phone ?? '',
    lang: student.education_lang ?? '',
    eduType: student.education_type ?? '',
    semestr: student.semester ?? '',
    pay: student.payment_form ?? '',
    kursLevel: student.level ? `${kursOf(student.level)}-kurs` : '',
  };
}

/** Персональные данные. Требуют отдельного права, иначе 403. */
export async function getStudentSensitive(id: number): Promise<StudentSensitive> {
  const data = await api.get<ApiStudentSensitive>(`/students/${id}/sensitive`);
  return {
    jshshir: data.jshshir ?? '',
    passport: data.passport ?? '',
    vil: data.region ?? '',
    tum: data.district ?? '',
    address: data.address ?? '',
    soc: data.social_category ?? '',
    pov: data.benefit ?? '',
  };
}
