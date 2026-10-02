import type { GroupOption, SubjectUser } from '@/services/generalTestService';

/** Foydalanuvchi turi — natijalarda ham, fanga biriktirishda ham bir xil nom. */
export const KIND_LABEL: Record<SubjectUser['user_kind'], string> = {
    student: 'Talaba',
    teacher: "O'qituvchi",
    boshqa: 'Xodim',
};

export const selectClassName =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Savollar soni: «100» yoki, urinishga kamrog'i berilsa, «20 / 100»
 * (urinishda / jami). Sozlangan son savollardan ko'p bo'lsa, bekend borini
 * beradi — shuning uchun bu yerda ham kichigi olinadi.
 */
export const questionsLabel = (t: { question_number: number | null; question_count: number }) =>
    t.question_number && t.question_number < t.question_count
        ? `${t.question_number} / ${t.question_count}`
        : String(t.question_count);

/** Test nomi — bekenddagi `_compose_title` bilan bir xil (oldindan ko'rsatish uchun). */
export const composeTitle = (subjectName: string, groupNames: string[]) => {
    const names = [...groupNames].sort();
    if (!names.length) return subjectName;
    const rest = names.length - 3;
    return `${subjectName} — ${names.slice(0, 3).join(', ')}${rest > 0 ? ` va yana ${rest} ta guruh` : ''}`;
};

/** `GroupChecklist` tanlovini almashtirish: id → nom. */
export const toggleGroup = (prev: Map<number, string>, group: GroupOption) => {
    const next = new Map(prev);
    if (next.has(group.id)) next.delete(group.id);
    else next.set(group.id, group.name);
    return next;
};

export const ACTIVE_BADGE =
    'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400';
export const INACTIVE_BADGE = 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground';
