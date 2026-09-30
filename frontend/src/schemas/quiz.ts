import { z } from 'zod';

// Sarlavha formadan olib tashlandi: u fan, guruh, sana va semestrdan yig'iladi,
// shuning uchun bu uchtasi endi majburiy.
export const quizSchema = z.object({
    question_number: z.string().min(1, 'Savollar soni kiritilishi shart').refine(
        (val: string) => !isNaN(parseInt(val)) && parseInt(val) > 0,
        "Musbat son bo'lishi kerak",
    ),
    duration: z.string().min(1, 'Davomiylik kiritilishi shart').refine(
        (val: string) => !isNaN(parseInt(val)) && parseInt(val) > 0,
        "Musbat son bo'lishi kerak",
    ),
    pin: z.string().min(4, 'PIN kiritilishi shart'),
    // Ma'ruzachi: savollar uning bankidan yig'iladi, testni esa tashkilotchi yaratadi.
    lecturer_id: z.string().min(1, "Ma'ruzachi tanlanishi shart"),
    subject_id: z.string().min(1, 'Fan tanlanishi shart'),
    // Ochiq testda guruh va semestr bo'lmaydi: uni tizimda hisobi yo'q odam
    // yechadi, unga guruh biriktirilmaydi. Shuning uchun majburiylik
    // pastdagi `superRefine` da — turga qarab.
    //
    // Bitta test bir nechta guruhga biriktirilishi mumkin: bir martalik
    // sinov odatda bir vaqtda bir necha guruhda o'tkaziladi.
    group_ids: z.array(z.number()),
    semester_number: z.string(),
    // Nazorat turi: dars testi, semestr yakuni, kursdan kursga yoki ochiq test.
    quiz_type: z.enum(['LESSON_QUIZ', 'SEMESTER_FINAL', 'YEAR_PROMOTION', 'PUBLIC_FREE']),
    is_active: z.boolean(),
    proctoring_mode: z.enum(['face', 'standard']),
}).superRefine((values, ctx) => {
    if (values.quiz_type === 'PUBLIC_FREE') return;
    if (values.group_ids.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['group_ids'], message: 'Kamida bitta guruh tanlanishi shart' });
    }
    if (!values.semester_number) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semester_number'], message: 'Semestr tanlanishi shart' });
    }
});

export type QuizFormValues = z.infer<typeof quizSchema>;
