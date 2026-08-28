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
    group_id: z.string().min(1, 'Guruh tanlanishi shart'),
    semester_number: z.string().min(1, 'Semestr tanlanishi shart'),
    // Nazorat turi: dars testi, semestr yakuni, kursdan kursga yoki ochiq test.
    quiz_type: z.enum(['LESSON_QUIZ', 'SEMESTER_FINAL', 'YEAR_PROMOTION', 'PUBLIC_FREE']),
    is_active: z.boolean(),
    proctoring_mode: z.enum(['face', 'standard']),
});

export type QuizFormValues = z.infer<typeof quizSchema>;
