import { z } from 'zod';

export const quizSchema = z.object({
    title: z.string().min(3, 'Sarlavha kiritilishi shart'),
    question_number: z.string().min(1, 'Savollar soni kiritilishi shart').refine(
        (val: string) => !isNaN(parseInt(val)) && parseInt(val) > 0,
        "Musbat son bo'lishi kerak",
    ),
    duration: z.string().min(1, 'Davomiylik kiritilishi shart').refine(
        (val: string) => !isNaN(parseInt(val)) && parseInt(val) > 0,
        "Musbat son bo'lishi kerak",
    ),
    pin: z.string().min(4, 'PIN kiritilishi shart'),
    user_id: z.string().optional(),
    group_id: z.string().optional(),
    subject_id: z.string().optional(),
    is_active: z.boolean(),
    proctoring_mode: z.enum(['face', 'standard']),
});

export type QuizFormValues = z.infer<typeof quizSchema>;
