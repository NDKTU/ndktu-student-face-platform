import { FlaskConical } from 'lucide-react';

/**
 * «Xizmat fani» chipi.
 *
 * Xizmat fani platformada test uchun tuziladi (bir martalik sinov, kirish
 * nazorati) va hisob-kitobga KIRMAYDI: uning natijasi reytingda, panellarda
 * va statistikada sanalmaydi. Belgisi bo'lmasa, o'qituvchi natijani ko'rib,
 * uni oddiy fan deb o'ylardi va reyting nega o'zgarmaganini tushunmasdi.
 *
 * `is_countable` yo'q bo'lsa (eski javob) chip ko'rsatilmaydi: bunday holatda
 * fan oddiy deb qabul qilinadi — bekendda ham standart qiymat `true`.
 */
export const ServiceSubjectBadge = ({
    subject,
}: {
    subject?: { is_countable?: boolean } | null;
}) => {
    if (subject?.is_countable !== false) return null;

    return (
        <span
            title="Test uchun tuzilgan fan: natijasi reyting va statistikaga kirmaydi"
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
        >
            <FlaskConical className="h-3 w-3" />
            <span>Xizmat fani</span>
        </span>
    );
};
