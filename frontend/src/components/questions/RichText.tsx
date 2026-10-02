import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/utils/sanitize';

/** Matnda HTML teg bormi — muharrirdan kelgan savol shunday saqlanadi. */
const HTML_TAG = /<\/?[a-z][\s\S]*?>/i;

/**
 * Savol yoki variant matni: HTML bo'lsa — tozalab chiziladi, oddiy matn
 * bo'lsa — qator ko'chishlari saqlanadi.
 *
 * Elementar test savollari ilgari oddiy matn edi (Excel'dan ham shunday
 * keladi), endi esa muharrirda yoziladi. Hammasini HTML deb chizsak, eski
 * savollardagi qator ko'chishlari yo'qolardi; hammasini matn deb chizsak —
 * yangilaridagi rasm o'rniga `<img>` yozuvi ko'rinardi.
 */
export function RichText({ value, className }: { value: string; className?: string }) {
    if (!HTML_TAG.test(value ?? '')) {
        return <span className={cn('whitespace-pre-wrap', className)}>{value}</span>;
    }
    return (
        <span
            className={cn('block min-w-0 [&_img]:max-w-full [&_img]:rounded-md [&_p]:m-0', className)}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
        />
    );
}

