import type { ControlType } from '@/services/questionService';
import type { ProctoringMode } from '@/services/quizService';

/**
 * Nazorat oynasining qoralamasi.
 *
 * Oynadan «Savol qo'shish» savol formasiga o'tadi — u alohida sahifa
 * (Jodit muharriri, rasmlar, savol turlari), oynaga sig'maydi. Qaytganda
 * o'qituvchi tanlagan darslar, son va PIN yo'qolmasligi uchun oyna holati
 * shu yerda turadi. `sessionStorage`: faqat shu vkladka va shu sessiya.
 */
export interface NazoratDraft {
    /** Tahrirlanayotgan nazorat; `null` — yangi. */
    quizId: number | null;
    controlType: ControlType | '';
    lessonIds: number[];
    groupId: string;
    questionNumber: string;
    duration: string;
    pin: string;
    proctoringMode: ProctoringMode;
    /** Eski qoralamada yo'q — `false` deb olinadi. */
    strictMode?: boolean;
    isActive: boolean;
}

/** Savol formasidan qaytganda oynani qayta ochish belgisi (`return_to` da). */
export const NAZORAT_REOPEN_PARAM = 'nazorat';

const key = (courseId: number) => `nazorat-draft:${courseId}`;

export const saveNazoratDraft = (courseId: number, draft: NazoratDraft) => {
    try {
        sessionStorage.setItem(key(courseId), JSON.stringify(draft));
    } catch {
        // Saqlab bo'lmasa — qaytganda oyna standart qiymatlar bilan ochiladi.
    }
};

export const readNazoratDraft = (courseId: number): NazoratDraft | null => {
    try {
        const raw = sessionStorage.getItem(key(courseId));
        return raw ? (JSON.parse(raw) as NazoratDraft) : null;
    } catch {
        return null;
    }
};

export const clearNazoratDraft = (courseId: number) => {
    try {
        sessionStorage.removeItem(key(courseId));
    } catch {
        // E'tiborsiz: qoralama faqat qayta ochishda o'qiladi.
    }
};
