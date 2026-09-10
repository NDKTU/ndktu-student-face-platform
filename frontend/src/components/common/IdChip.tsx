/**
 * Tashqi tizim identifikatori uchun yorliq.
 *
 * Bo'sh qiymat — normal holat: qo'lda kiritilgan guruhda EPMOS ID bo'lmaydi,
 * EPMOS'dan kelgan guruhda esa HEMIS ID hali bog'lanmagan bo'lishi mumkin.
 * Shuning uchun o'rniga chiziqcha — bu yerda nol yoki bizning lokal `id` ni
 * ko'rsatish adminni chalg'itardi: aynan shunday xato «HEMIS Kodi» ustunida
 * lokal `id` ning ko'rinishiga olib kelgan edi.
 */
export const IdChip = ({ value }: { value?: string | null }) => {
    if (!value) return <span className="text-xs text-muted-foreground/60">—</span>;
    return (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground border border-border/80">
            {value}
        </span>
    );
};
