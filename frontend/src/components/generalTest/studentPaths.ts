/**
 * Talaba ko'rinishida elementar test alohida bo'lim emas: ishlash
 * «Test ishlash» ichida, natijalar «Natijalar» ichida turadi. Eski
 * `/elementar-tests/...` manzillari talabani shu yerga yo'naltiradi
 * (`App.tsx` dagi `StudentRedirectRoute`).
 */
export const STUDENT_ELEMENTAR_TAKE = '/quiz-test/elementar';
export const STUDENT_ELEMENTAR_RESULTS = '/results/elementar';
export const studentElementarAttempt = (attemptId: number | string) =>
    `${STUDENT_ELEMENTAR_TAKE}/attempt/${attemptId}`;
