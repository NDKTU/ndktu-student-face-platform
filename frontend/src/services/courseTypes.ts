/**
 * Mashg'ulot turi kursning o'zida: EPOS yuklamasi aynan shu kesimda keladi
 * (`lecture`, `practice`, `lab`), va har bir tur alohida o'qituvchining
 * alohida yuklamasi bo'ladi. `seminar` EPOS'da yo'q — u faqat qo'lda
 * yaratiladigan kurs turi.
 */
export type CourseType = 'lecture' | 'practice' | 'lab' | 'seminar';

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
    lecture: "Ma'ruza",
    practice: 'Amaliyot',
    lab: 'Tajriba',
    seminar: 'Seminar',
};

export const COURSE_TYPE_OPTIONS: { value: CourseType; label: string }[] = [
    { value: 'lecture', label: COURSE_TYPE_LABELS.lecture },
    { value: 'practice', label: COURSE_TYPE_LABELS.practice },
    { value: 'lab', label: COURSE_TYPE_LABELS.lab },
    { value: 'seminar', label: COURSE_TYPE_LABELS.seminar },
];

/** Turi belgilanmagan eski kurslar ham bor — shuning uchun `undefined` qaytadi. */
export const courseTypeLabel = (value?: string | null) =>
    value ? COURSE_TYPE_LABELS[value as CourseType] ?? value : undefined;

/** Kurs nomidagi tur — kichik harfda: «Fizika — 101-19 (amaliyot, kuzgi semestr)». */
export const courseTypeNameLabel = (value?: string | null) => courseTypeLabel(value)?.toLowerCase();
