/**
 * Uy vazifasi holatlari — hamma sahifada bir xil so'z va rang.
 *
 * Ilgari har sahifa o'z yorlig'ini yozardi va bir xil holat turlicha
 * atalardi. Eng chalkashi — kechikish: server baho qo'yilganda holatni
 * `graded` ga almashtiradi, «kech topshirilgan» belgisi esa yo'qolardi.
 * Endi kechikish holatdan emas, topshirilgan vaqt bilan muddatdan
 * hisoblanadi, shuning uchun baholangandan keyin ham ko'rinib turadi.
 */
import type { SubmissionStatus } from '@/services/assignmentService';

/** Talaba ishining tekshiruv holati (kechikish alohida — `lateBy`). */
export type ReviewState = 'pending' | 'graded';

export const reviewState = (status: SubmissionStatus): ReviewState =>
    status === 'graded' ? 'graded' : 'pending';

export const REVIEW_LABEL: Record<ReviewState, string> = {
    pending: 'Tekshirilmagan',
    graded: 'Baholangan',
};

export const REVIEW_CLASS: Record<ReviewState, string> = {
    pending: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    graded: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

export const LATE_CLASS = 'border-destructive/25 bg-destructive/10 text-destructive';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** «2 kun 3 soat», «5 soat», «20 daqiqa». */
export const humanDuration = (ms: number): string => {
    const abs = Math.abs(ms);
    const days = Math.floor(abs / DAY);
    const hours = Math.floor((abs % DAY) / HOUR);
    if (days > 0) return hours > 0 ? `${days} kun ${hours} soat` : `${days} kun`;
    if (hours > 0) return `${hours} soat`;
    return `${Math.max(1, Math.floor(abs / MINUTE))} daqiqa`;
};

/** Ish muddatdan qancha kech topshirilgani. Vaqtida bo'lsa — null. */
export const lateBy = (submittedAt: string | null | undefined, deadline: string): string | null => {
    if (!submittedAt) return null;
    const diff = new Date(submittedAt).getTime() - new Date(deadline).getTime();
    return diff > 0 ? humanDuration(diff) : null;
};

export const isPastDeadline = (deadline: string) => new Date(deadline).getTime() < Date.now();

/** «3 kun qoldi» yoki «Muddat 2 kun oldin tugagan». */
export const deadlineHint = (deadline: string): string => {
    const diff = new Date(deadline).getTime() - Date.now();
    return diff > 0 ? `${humanDuration(diff)} qoldi` : `Muddat ${humanDuration(diff)} oldin tugagan`;
};

/** Talaba qanday javob bera olishi — matn, fayl yoki ikkalasi. */
export const answerFormatLabel = (allowText: boolean, allowFile: boolean): string => {
    if (allowText && allowFile) return 'Matn yozish va/yoki fayl biriktirish mumkin';
    if (allowText) return 'Faqat matn ko\'rinishida';
    if (allowFile) return 'Faqat fayl ko\'rinishida';
    return 'Javob turi belgilanmagan';
};

/** Qisqa ko'rinish — kartadagi kichik yorliq uchun. */
export const answerFormatShort = (allowText: boolean, allowFile: boolean): string => {
    if (allowText && allowFile) return 'Matn yoki fayl';
    if (allowText) return 'Faqat matn';
    if (allowFile) return 'Faqat fayl';
    return 'Belgilanmagan';
};
