import { z } from 'zod';

export const facultySchema = z.object({
    name: z.string().min(1, 'Fakultet nomi kiritilishi shart'),
});

export type FacultyFormValues = z.infer<typeof facultySchema>;
