import { useState } from 'react';
import { AlertTriangle, ImageOff } from 'lucide-react';

import { Modal } from '@/components/ui/Modal';
import type { Result } from '@/services/resultService';

interface Props {
    result: Pick<Result, 'cheating_detected' | 'cheating_image_url' | 'reason_for_stop'>;
    /** 'chip' — ro'yxat qatori uchun, 'block' — natija sahifasi uchun. */
    variant?: 'chip' | 'block';
}

/**
 * Ko'chirish dalili — yuz nazorati olgan surat.
 *
 * Nega kerak. Surat allaqachon saqlanardi (`results.cheating_image_url`)
 * va javobda ham kelardi, lekin hech qayerda ko'rsatilmasdi: o'qituvchi
 * «ko'chirish aniqlangan» degan belgini ko'rardi, dalilni esa yo'q.
 * Ya'ni baho tushirish kerakmi yoki nazorat yanglishganmi — buni
 * tekshirib bo'lmasdi.
 *
 * Surat `/uploads/cheating_evidence/...` dan beriladi (statik fayl).
 */
export const CheatingEvidence = ({ result, variant = 'chip' }: Props) => {
    const [open, setOpen] = useState(false);

    if (!result.cheating_detected) return null;

    const hasImage = Boolean(result.cheating_image_url);
    const reason = result.reason_for_stop;

    const body = (
        <div className="space-y-3">
            {reason && (
                <p className="text-sm">
                    <span className="text-muted-foreground">Sabab: </span>
                    <span className="font-medium">{reason}</span>
                </p>
            )}
            {hasImage ? (
                <img
                    src={result.cheating_image_url!}
                    alt="Ko'chirish dalili"
                    className="w-full rounded-xl border border-border object-contain"
                />
            ) : (
                // Nazorat ishga tushgan, lekin surat saqlanmagan ham bo'ladi
                // (kamera o'chirilgan, yuklash uzilgan). Buni aytib qo'yish
                // kerak: aks holda bo'sh oyna xatoga o'xshardi.
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
                    <ImageOff className="h-4 w-4" />
                    Surat saqlanmagan — faqat belgi qolgan.
                </div>
            )}
        </div>
    );

    return (
        <>
            {variant === 'chip' ? (
                <button
                    type="button"
                    // Chip bosiladigan qator/kartochka ICHIDA turadi
                    // (`DataTable.onRowClick`, `ResultCard`) va ular javoblar
                    // sahifasiga o'tkazadi. Hodisa shu yerda to'xtatiladi,
                    // aks holda dalilni ochmoqchi bo'lgan odam boshqa
                    // sahifaga tushib ketardi. `mousedown`/`pointerdown` ham
                    // to'xtatiladi: qator ishlov berishni o'shandan
                    // boshlasa, faqat `click` yetmay qolardi.
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setOpen(true);
                    }}
                    title="Ko'chirish dalilini ko'rish"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/20"
                >
                    <AlertTriangle className="h-3 w-3" />
                    Ko'chirish
                </button>
            ) : (
                <section className="rounded-2xl border border-destructive/40 bg-destructive/[0.04] p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <h2 className="text-sm font-semibold text-destructive">Ko'chirish aniqlangan</h2>
                    </div>
                    {body}
                </section>
            )}

            {variant === 'chip' && (
                <Modal isOpen={open} onClose={() => setOpen(false)} title="Ko'chirish dalili">
                    {body}
                </Modal>
            )}
        </>
    );
};
