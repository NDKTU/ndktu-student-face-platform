import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

/** Shuncha barmoq ekranda bo'lsa — skrinshot imo-ishorasi (Xiaomi, Samsung:
 *  uch barmoq bilan pastga). Ikki barmoq mumkin: biri «ko'rish» tugmasida,
 *  ikkinchisi variantni tanlaydi. */
const SCREENSHOT_GESTURE_POINTERS = 3;

/**
 * Matnni yashirish: savol faqat «ko'rish» tugmasi bosilib turganda ko'rinadi.
 *
 * Skrinshotni brauzer sezmaydi, shuning uchun matn teskarisiga — doim xira,
 * faqat bosib turilganda ochiq. Oddiy skrinshot xira chiqadi; aniq rasm uchun
 * bir qo'l bilan ekranni bosib turib, ikkinchisi bilan tugmalarni bosish
 * kerak. Bu taqiq emas, lekin har savolda shuni qilish noqulay.
 *
 * Kompyuterda — tugmani sichqoncha bilan bosib turish yoki Probel.
 */
export function useHoldToReveal(enabled: boolean) {
    const [holding, setHolding] = useState(false);
    const holdPointer = useRef<number | null>(null);
    // Uch barmoq tushgan bo'lsa — hammasi ko'tarilmaguncha qayta ochilmaydi.
    const [locked, setLocked] = useState(false);
    const pointers = useRef(new Set<number>());

    const hide = useCallback(() => {
        holdPointer.current = null;
        setHolding(false);
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const active = pointers.current;

        const down = (event: PointerEvent) => {
            active.add(event.pointerId);
            if (active.size >= SCREENSHOT_GESTURE_POINTERS) {
                setLocked(true);
                hide();
            }
        };
        const up = (event: PointerEvent) => {
            active.delete(event.pointerId);
            if (event.pointerId === holdPointer.current) hide();
            if (active.size === 0) setLocked(false);
        };
        // Probel fokusdagi tugmani ham bosardi (variant tanlanib qolardi) —
        // shuning uchun ikkala hodisada ham `preventDefault`.
        const isSpace = (event: KeyboardEvent) =>
            event.code === 'Space' && !(event.target as HTMLElement)?.closest('input, textarea');
        const keyDown = (event: KeyboardEvent) => {
            if (!isSpace(event)) return;
            event.preventDefault();
            setHolding(true);
        };
        const keyUp = (event: KeyboardEvent) => {
            if (!isSpace(event)) return;
            event.preventDefault();
            hide();
        };
        // Sahifa fonga ketsa yoki fokus yo'qolsa — darhol yopiladi.
        const visibility = () => {
            if (document.visibilityState === 'hidden') hide();
        };

        // `capture`: tugma yoki variant `stopPropagation` qilsa ham barmoqlar sanaladi.
        window.addEventListener('pointerdown', down, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', up, true);
        window.addEventListener('keydown', keyDown);
        window.addEventListener('keyup', keyUp);
        window.addEventListener('blur', hide);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            window.removeEventListener('pointerdown', down, true);
            window.removeEventListener('pointerup', up, true);
            window.removeEventListener('pointercancel', up, true);
            window.removeEventListener('keydown', keyDown);
            window.removeEventListener('keyup', keyUp);
            window.removeEventListener('blur', hide);
            document.removeEventListener('visibilitychange', visibility);
            active.clear();
        };
    }, [enabled, hide]);

    const holdProps = {
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
            if (locked) return;
            holdPointer.current = event.pointerId;
            setHolding(true);
        },
        onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
            // Sichqoncha tugmadan chiqib ketsa. Barmoqda `pointerleave` faqat
            // ko'tarilganda keladi — u `pointerup` bilan bir xil.
            if (event.pointerType === 'mouse' && event.pointerId === holdPointer.current) hide();
        },
        // Uzoq bosishda menyu va matn belgilash chiqmasin.
        onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    };

    return {
        /** Matn yashirilganmi. Rejim o'chiq bo'lsa — hech qachon. */
        hidden: enabled && (!holding || locked),
        holding: holding && !locked,
        holdProps,
    };
}
