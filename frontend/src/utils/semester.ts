/**
 * Semestrlar nomi. Universitetda ular «1/2» emas, «kuzgi» va «bahorgi» deb
 * ataladi — formalar, filtrlar va yig'iladigan nomlar shu yerdan oladi.
 * Bekenddagi juftligi: `app/core/enums.py::SEMESTER_LABELS`.
 */
export const SEMESTER_LABELS: Record<number, string> = {
    1: 'Kuzgi',
    2: 'Bahorgi',
};

export const SEMESTER_OPTIONS = [
    { value: '1', label: 'Kuzgi semestr' },
    { value: '2', label: 'Bahorgi semestr' },
];

/** 1 -> «kuzgi semestr», 2 -> «bahorgi semestr». Boshqa qiymat — o'zicha. */
export const semesterLabel = (semesterNumber?: number | null): string | null => {
    if (!semesterNumber) return null;
    const name = SEMESTER_LABELS[semesterNumber];
    return name ? `${name.toLowerCase()} semestr` : `${semesterNumber}-semestr`;
};
