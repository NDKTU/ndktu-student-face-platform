/**
 * O'qituvchi yuklamasidan (`teacher-load`) seans formasi uchun tanlovlar:
 * qaysi guruhlar, tanlangan guruhlarda qaysi fanlar va qaysi turlar.
 * Sof funksiyalar — forma ham, testlar ham shularni ishlatadi.
 */
import type { TeacherLoadItem } from '@/services/zoomSessionService';

export interface LoadGroup {
    id: number;
    name: string;
    /** Shu guruhda o'tadigan fanlar — guruh ostida izoh bo'lib chiqadi. */
    subjects: string[];
}

/** Yuklamadagi guruhlar (nomi bo'yicha), har biri o'z fanlari bilan. */
export const loadGroups = (items: TeacherLoadItem[]): LoadGroup[] => {
    const groups = new Map<number, LoadGroup>();
    for (const item of items) {
        const group = groups.get(item.group_id) ?? { id: item.group_id, name: item.group_name, subjects: [] };
        if (!group.subjects.includes(item.subject_name)) group.subjects.push(item.subject_name);
        groups.set(item.group_id, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
};

/** Tanlangan guruhlardan yuklamadagilari (qo'lda qo'shilgan boshqa guruhlar hisobga olinmaydi). */
const loadGroupIds = (items: TeacherLoadItem[], selected: Iterable<number>) => {
    const known = new Set(items.map((item) => item.group_id));
    return [...selected].filter((id) => known.has(id));
};

/**
 * Fan variantlari: tanlangan (yuklamadagi) guruhlarning HAMMASIDA o'tadigan
 * fanlar — oqim ma'ruzasida bir nechta guruh tanlanadi, fan esa umumiy
 * bo'lishi kerak. Guruh tanlanmagan bo'lsa — o'qituvchining barcha fanlari.
 */
export const loadSubjects = (items: TeacherLoadItem[], selected: Iterable<number>): { id: number; name: string }[] => {
    const groupIds = loadGroupIds(items, selected);
    const subjects = new Map<number, { name: string; groups: Set<number> }>();
    for (const item of items) {
        const entry = subjects.get(item.subject_id) ?? { name: item.subject_name, groups: new Set<number>() };
        entry.groups.add(item.group_id);
        subjects.set(item.subject_id, entry);
    }
    return [...subjects.entries()]
        .filter(([, entry]) => groupIds.every((id) => entry.groups.has(id)))
        .map(([id, entry]) => ({ id, name: entry.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

/** Shu fanning tanlangan guruhlardagi turlari (guruh tanlanmagan bo'lsa — hamma guruhlardagisi). */
export const loadTypes = (items: TeacherLoadItem[], subjectId: number | null, selected: Iterable<number>): string[] => {
    if (subjectId == null) return [];
    const groupIds = new Set(loadGroupIds(items, selected));
    const types = new Set<string>();
    for (const item of items) {
        if (item.subject_id !== subjectId) continue;
        if (groupIds.size > 0 && !groupIds.has(item.group_id)) continue;
        item.load_types.forEach((type) => types.add(type));
    }
    return [...types];
};
