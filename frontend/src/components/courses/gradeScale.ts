/**
 * 5 balli baholash shkalasi — talaba ham, o'qituvchi ham bir xil so'z va
 * rangni ko'rsin.
 *
 * Ilgari 4 va 5 bir xil yashil edi: jadvalda «a'lo» bilan «yaxshi»ni ajratish
 * uchun raqamni o'qish kerak bo'lardi. Endi har bahoning o'z rangi bor.
 */

export type GradeLevel = 5 | 4 | 3 | 2;

/** Uy vazifasi yoki o'rtacha qiymatni butun bahoga keltiradi (4.5 → 5). */
export const gradeLevel = (onFive: number): GradeLevel =>
    onFive >= 4.5 ? 5 : onFive >= 3.5 ? 4 : onFive >= 2.5 ? 3 : 2;

export const GRADE_WORD: Record<GradeLevel, string> = {
    5: "A'lo",
    4: 'Yaxshi',
    3: 'Qoniqarli',
    2: 'Qoniqarsiz',
};

/** Katak, nishon va quti uchun: chegara, fon va matn rangi. */
export const GRADE_TONE: Record<GradeLevel, string> = {
    5: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    4: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    3: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    2: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

/** Faqat matn rangi — holat yozuvlari uchun. */
export const GRADE_TEXT: Record<GradeLevel, string> = {
    5: 'text-emerald-700 dark:text-emerald-400',
    4: 'text-sky-700 dark:text-sky-400',
    3: 'text-amber-700 dark:text-amber-400',
    2: 'text-rose-700 dark:text-rose-400',
};

export const gradeTone = (onFive: number) => GRADE_TONE[gradeLevel(onFive)];
export const gradeWord = (onFive: number) => GRADE_WORD[gradeLevel(onFive)];

export const GRADE_LEVELS: GradeLevel[] = [5, 4, 3, 2];
