/**
 * Test sarlavhasi va kurs nomi serverda yig'iladi
 * (`quiz/repository.py::build_title`, `course/repository.py::_build_course_name`).
 * Bu yerdagi funksiyalar faqat formadagi oldindan ko'rish uchun: foydalanuvchi
 * saqlashdan oldin qanday nom hosil bo'lishini ko'rishi kerak.
 */

import { semesterLabel } from '@/utils/semester';
import { COURSE_TYPE_LABELS, courseTypeNameLabel } from '@/services/courseTypes';

const formatDate = (date: Date) =>
    `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;

const withSemester = (name: string, semesterNumber?: number) => {
    const label = semesterLabel(semesterNumber);
    return label ? `${name} (${label})` : name;
};

/** «Oliy matematika — 101-19 — 21.08.2026 (kuzgi semestr)» */
export const buildQuizTitle = (
    subjectName?: string,
    groupName?: string,
    semesterNumber?: number,
    date: Date = new Date(),
): string => {
    const parts = [subjectName, groupName].filter(Boolean) as string[];
    parts.push(formatDate(date));
    return withSemester(parts.join(' — '), semesterNumber);
};

/** «Oliy matematika — 101-19, 102-19 (amaliyot, kuzgi semestr)» */
export const buildCourseName = (
    subjectName?: string,
    groupNames: string[] = [],
    semesterNumber?: number,
    courseType?: string,
): string => {
    let name = subjectName || 'Kurs';
    if (groupNames.length > 0) {
        const sorted = [...groupNames].sort((a, b) => a.localeCompare(b));
        // Serverdagi kabi: uchtadan ortiq guruh «+N» bo'lib qisqaradi, aks holda
        // nom jadval qatoriga sig'maydi.
        const shown = sorted.slice(0, 3).join(', ');
        name = `${name} — ${sorted.length > 3 ? `${shown} +${sorted.length - 3}` : shown}`;
    }
    const parts = [courseTypeNameLabel(courseType), semesterLabel(semesterNumber)].filter(Boolean);
    return parts.length > 0 ? `${name} (${parts.join(', ')})` : name;
};

const COURSE_TYPE_WORDS = new Set(Object.values(COURSE_TYPE_LABELS).map((label) => label.toLowerCase()));

export interface CourseNameParts {
    subject: string;
    groups?: string;
    type?: string;
    semester?: string;
}

/**
 * `buildCourseName` ning teskarisi — uzun nomni ro'yxatda ikki qatorga bo'lish
 * uchun: «Fizika — 101-19, 102-19 (amaliyot, kuzgi semestr)» →
 * fan «Fizika», guruhlar «101-19, 102-19», tur «amaliyot», semestr «kuzgi semestr».
 *
 * Oxirgi qavs faqat ichida tur yoki semestr bo'lsa ajratiladi: guruh va fan
 * nomining o'zida ham qavs uchraydi («44sB-22 Met (Zar)», «(MET 3 KURS)»).
 * Tanilmagan nom butunligicha `subject` bo'lib qaytadi.
 */
export const splitCourseName = (name: string): CourseNameParts => {
    let rest = name.trim();
    let type: string | undefined;
    let semester: string | undefined;

    const tail = rest.match(/^(.*\S)\s*\(([^()]+)\)$/);
    if (tail) {
        const parts = tail[2].split(',').map((part) => part.trim());
        const known = parts.every((part) => COURSE_TYPE_WORDS.has(part.toLowerCase()) || part.endsWith('semestr'));
        if (known) {
            rest = tail[1];
            type = parts.find((part) => COURSE_TYPE_WORDS.has(part.toLowerCase()));
            semester = parts.find((part) => part.endsWith('semestr'));
        }
    }

    // Guruhlar ro'yxatida « — » bo'lmaydi, fan nomida esa uchrashi mumkin —
    // shuning uchun oxirgisi bo'yicha bo'linadi.
    const at = rest.lastIndexOf(' — ');
    return at === -1
        ? { subject: rest, type, semester }
        : { subject: rest.slice(0, at), groups: rest.slice(at + 3), type, semester };
};
