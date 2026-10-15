import type { ScheduleLesson } from '@/services/hemisScheduleService';

/**
 * Hafta mahalliy vaqt bo'yicha hisoblanadi: foydalanuvchilar Toshkentda,
 * bekend ham sanalarni Toshkent bo'yicha saqlaydi (`schedule_sync.py::_date`).
 * `toISOString()` ishlatilmaydi — u UTC ga o'tkazadi va yarim tundan keyin
 * kunni bittaga orqaga surardi.
 */
const pad = (value: number) => String(value).padStart(2, '0');

export const toIsoDate = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "2026-10-29" → mahalliy yarim tun. `new Date("2026-10-29")` UTC deb o'qirdi. */
export const parseIsoDate = (value: string): Date => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export const addDays = (date: Date, days: number): Date => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

export const mondayOf = (date: Date): Date => {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // getDay(): yakshanba 0 — u haftaning oxiri, boshi emas.
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
};

/** Dushanbadan boshlab. */
export const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

export const weekdayOf = (isoDate: string): string => WEEKDAYS[(parseIsoDate(isoDate).getDay() + 6) % 7];

/** "14:10:00" → "14:10". */
export const hhmm = (value: string | null): string => (value ? value.slice(0, 5) : '');

export const lessonTime = (lesson: Pick<ScheduleLesson, 'start_time' | 'end_time'>): string => {
    const start = hhmm(lesson.start_time);
    const end = hhmm(lesson.end_time);
    return start && end ? `${start}–${end}` : start || end;
};

/**
 * Mashg'ulot turi rangi — HEMIS kodlari bo'yicha: 11 ma'ruza, 12
 * laboratoriya, 13 amaliy, 14 seminar. Notanish kod neytral qoladi:
 * nomi baribir yoniga yoziladi.
 */
export const trainingTone = (code: string): string => {
    switch (code) {
        case '11':
            return 'bg-primary/10 text-primary';
        case '12':
            return 'bg-warning/15 text-warning';
        case '13':
            return 'bg-success/15 text-success';
        case '14':
            return 'bg-accent text-accent-foreground';
        default:
            return 'bg-muted text-muted-foreground';
    }
};

/** Telefon kalendaridagi nuqta: kichik doirada och fon ko'rinmaydi, rang to'liq. */
export const trainingDot = (code: string): string => {
    switch (code) {
        case '11':
            return 'bg-primary';
        case '12':
            return 'bg-warning';
        case '13':
            return 'bg-success';
        case '14':
            return 'bg-accent-foreground';
        default:
            return 'bg-muted-foreground';
    }
};

export interface DayLesson {
    lesson: ScheduleLesson;
    groups: string[];
}

export interface WeekDay {
    name: string;
    iso: string;
    lessons: DayLesson[];
}

/**
 * O'qituvchi bitta juftlikda bir nechta guruhga dars o'tishi mumkin (oqim):
 * HEMIS har bir guruh uchun alohida qator beradi. Ularni bitta kartochkaga
 * yig'amiz — aks holda bir ma'ruza uch marta takrorlanib turardi.
 */
const mergeStreams = (items: ScheduleLesson[]): DayLesson[] => {
    const merged = new Map<string, DayLesson>();
    for (const lesson of items) {
        const key = [
            lesson.lesson_date,
            lesson.lesson_pair,
            lesson.subject_hemis_id,
            lesson.training_type_code,
            lesson.auditorium_code,
            lesson.employee_hemis_id,
        ].join('|');
        const existing = merged.get(key);
        if (existing) {
            if (lesson.group_name && !existing.groups.includes(lesson.group_name)) {
                existing.groups.push(lesson.group_name);
            }
        } else {
            merged.set(key, { lesson, groups: lesson.group_name ? [lesson.group_name] : [] });
        }
    }
    return Array.from(merged.values());
};

/** Darslar sanalar bo'yicha; `merge` — oqimlarni bitta kartochkaga yig'ish. */
export const groupByDate = (items: ScheduleLesson[], merge: boolean): Map<string, DayLesson[]> => {
    const byDate = new Map<string, ScheduleLesson[]>();
    for (const lesson of items) {
        const list = byDate.get(lesson.lesson_date) ?? [];
        list.push(lesson);
        byDate.set(lesson.lesson_date, list);
    }
    const result = new Map<string, DayLesson[]>();
    for (const [iso, lessons] of byDate) {
        result.set(iso, merge ? mergeStreams(lessons) : lessons.map((lesson) => ({ lesson, groups: [] })));
    }
    return result;
};

/**
 * Darslarni hafta kunlariga taqsimlaydi (dushanbadan). Yakshanba odatda
 * bo'sh — dars bo'lsagina qaytadi.
 *
 * `merge` — oqimlarni bitta kartochkaga yig'ish: o'qituvchi ko'rinishida
 * kerak, guruh ko'rinishida esa har bir dars o'zi alohida.
 */
export const buildWeek = (items: ScheduleLesson[], weekStart: Date, merge: boolean): WeekDay[] => {
    const byDate = groupByDate(items, merge);
    return WEEKDAYS.map((name, index) => {
        const iso = toIsoDate(addDays(weekStart, index));
        return { name, iso, lessons: byDate.get(iso) ?? [] };
    }).filter((day, index) => index < 6 || day.lessons.length > 0);
};

export type ScheduleView = 'list' | 'week' | 'month';

export const MONTHS = [
    'Yanvar',
    'Fevral',
    'Mart',
    'Aprel',
    'May',
    'Iyun',
    'Iyul',
    'Avgust',
    'Sentabr',
    'Oktabr',
    'Noyabr',
    'Dekabr',
];

export const monthStartOf = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (monthStart: Date, months: number): Date =>
    new Date(monthStart.getFullYear(), monthStart.getMonth() + months, 1);

/**
 * Oy setkasi: birinchi kun tushgan haftaning dushanbasidan oxirgi kun
 * tushgan haftaning yakshanbasigacha — 4–6 to'liq hafta. Qo'shni oylarning
 * kunlari ham bor (xira ko'rsatiladi), shuning uchun so'rov ham shu
 * oraliqqa ketadi.
 */
export const monthGrid = (monthStart: Date): { start: Date; end: Date; weeks: number } => {
    const start = mondayOf(monthStart);
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const end = addDays(mondayOf(lastDay), 6);
    // Kunlar farqi yaxlitlanadi: yozgi vaqtga o'tish bor mintaqada sutka 23 soat bo'ladi.
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return { start, end, weeks: days / 7 };
};

/** Tanlangan ko'rinish uchun so'rov oralig'i (`YYYY-MM-DD`). */
export const viewRange = (view: ScheduleView, weekStart: Date, monthStart: Date): [string, string] => {
    if (view === 'month') {
        const { start, end } = monthGrid(monthStart);
        return [toIsoDate(start), toIsoDate(end)];
    }
    return [toIsoDate(weekStart), toIsoDate(addDays(weekStart, 6))];
};
