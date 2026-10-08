import { useMemo } from 'react';
import type { User } from '@/types/auth';
import { formatDateTime } from '@/utils/date';

/**
 * Test ustidagi yarim shaffof suv belgisi: FIO, talaba ID va vaqt.
 *
 * Skrinshotni brauzerda taqiqlab bo'lmaydi, lekin uni kimniki ekanini
 * yashirib ham bo'lmaydi: Telegram'ga tushgan savol rasmida ism ko'rinadi.
 * `pointer-events-none` — bosishlar ostidagi tugmalarga o'tadi.
 */
export function QuizWatermark({ user }: { user: User | null }) {
    const label = useMemo(() => {
        if (!user) return '';
        // Talabada — FIO va talaba ID; profilsiz hisobda (admin, xodim) ikkalasi
        // ham login bo'lib, «admin · admin» deb takrorlanardi.
        const name = user.student?.full_name || user.teacher?.full_name || user.username;
        const parts = [name, user.student?.student_id_number || user.username];
        return [...new Set(parts.filter(Boolean)), formatDateTime(new Date())].join(' · ');
    }, [user]);

    if (!label) return null;

    return (
        <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[60] overflow-hidden select-none"
        >
            <div className="absolute -inset-1/2 flex -rotate-[30deg] flex-col justify-center gap-16">
                {Array.from({ length: 14 }, (_, row) => (
                    <div
                        key={row}
                        className="whitespace-nowrap text-sm font-semibold text-foreground/[0.07]"
                        style={{ paddingLeft: `${(row % 2) * 8}rem` }}
                    >
                        {Array.from({ length: 6 }, () => label).join('       ')}
                    </div>
                ))}
            </div>
        </div>
    );
}
