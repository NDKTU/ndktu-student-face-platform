import type { Subject } from '@/services/subjectService';

/**
 * O'quv reja nomining ko'rsatish uchun qisqartirilgan shakli.
 *
 * EPMOS nomni kod bilan beradi: «60610400\tDasturiy injiniring 1-kurs
 * (kunduzgi)» yoki «60310100 – Iqtisodiyot 4 KURS SIRTQI». Ro'yxatda kod
 * foyda bermaydi — u har bir yozuvda bir xil boshlanadi va farqni ko'rsatuvchi
 * qismni o'ngga surib yuboradi.
 */
export const curriculumShortName = (name?: string | null): string =>
    (name ?? '')
        .replace(/^\s*\d{6,9}\s*[–—-]?\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Fan yozuvining ikkinchi qatori: qaysi reja va qaysi semestr.
 *
 * Bo'sh satr — ajratadigan narsa yo'q (qo'lda kiritilgan fan yoki reja
 * bog'lanmagan). Chaqiruvchi uni `undefined` ga aylantiradi, ya'ni ikkinchi
 * qator umuman chizilmaydi.
 */
export const subjectHint = (
    subject: Pick<Subject, 'curriculum' | 'semester' | 'external_id'>,
): string => {
    const plan = curriculumShortName(subject.curriculum?.name);
    const semester = subject.semester?.trim();
    const label = [plan, semester].filter(Boolean).join(' · ');
    if (label) return label;
    // Rejasi bo'lmagan yozuvlar ham bor (EPMOS'da `edu_plan_id` bo'sh — 3064
    // fandan 146 tasi). Ular orasida bir xil nomlilari uchrasa, hech
    // bo'lmasa EPMOS raqami bo'yicha ajratib bo'ladi va uni o'sha yerda
    // tekshirish mumkin.
    return subject.external_id ? `EPMOS #${subject.external_id}` : '';
};

/** Combobox uchun tayyor variant. */
export const subjectOption = (subject: Subject) => {
    const hint = subjectHint(subject);
    return { value: String(subject.id), label: subject.name, hint: hint || undefined };
};
