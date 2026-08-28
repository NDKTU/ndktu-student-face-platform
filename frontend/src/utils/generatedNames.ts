/**
 * Test sarlavhasi va kurs nomi serverda yig'iladi
 * (`quiz/repository.py::build_title`, `course/repository.py::_build_course_name`).
 * Bu yerdagi funksiyalar faqat formadagi oldindan ko'rish uchun: foydalanuvchi
 * saqlashdan oldin qanday nom hosil bo'lishini ko'rishi kerak.
 */

import { semesterLabel } from '@/utils/semester';

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

/** «Oliy matematika — 101-19, 102-19 (kuzgi semestr)» */
export const buildCourseName = (
    subjectName?: string,
    groupNames: string[] = [],
    semesterNumber?: number,
): string => {
    let name = subjectName || 'Kurs';
    if (groupNames.length > 0) {
        const sorted = [...groupNames].sort((a, b) => a.localeCompare(b));
        // Serverdagi kabi: uchtadan ortiq guruh «+N» bo'lib qisqaradi, aks holda
        // nom jadval qatoriga sig'maydi.
        const shown = sorted.slice(0, 3).join(', ');
        name = `${name} — ${sorted.length > 3 ? `${shown} +${sorted.length - 3}` : shown}`;
    }
    return withSemester(name, semesterNumber);
};
