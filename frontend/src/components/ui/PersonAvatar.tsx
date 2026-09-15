import { useState } from 'react';
import { cn } from '@/lib/utils';
import { initialsOf, tileFor } from '@/lib/avatarTiles';

interface PersonAvatarProps {
    /** Rang plitkasini barqaror tanlash uchun — odatda qator id'si. */
    id: number;
    name: string;
    /** HEMIS'dagi surat. Yo'q bo'lsa yoki yuklanmasa — bosh harflar. */
    src?: string | null;
    className?: string;
}

/**
 * Odam avatari: surat bo'lsa surat, bo'lmasa bosh harflar.
 *
 * Nega alohida komponent. Surat tashqi manbadan keladi (HEMIS), ya'ni
 * yuklanmasligi mumkin: domen yopiq, fayl o'chirilgan, tarmoq yo'q. Oddiy
 * `<img>` bunday holatda buzilgan rasm belgisini ko'rsatardi, shuning uchun
 * xato holati ushlanadi va bosh harflarga qaytiladi. Talabalar ro'yxatida
 * bunday kartochka minglab bo'lgani uchun har biriga alohida holat kerak.
 */
export const PersonAvatar = ({ id, name, src, className }: PersonAvatarProps) => {
    const [failed, setFailed] = useState(false);
    const showImage = Boolean(src) && !failed;

    return (
        <div
            className={cn(
                'flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold shadow-xs',
                // Fon plitkasi surat bo'lganda ham qoladi: u yuklanguncha
                // bo'sh oq kvadrat o'rniga rangli joy ko'rinadi.
                tileFor(id),
                className,
            )}
        >
            {showImage ? (
                <img
                    src={src as string}
                    alt={name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={() => setFailed(true)}
                />
            ) : (
                initialsOf(name)
            )}
        </div>
    );
};
