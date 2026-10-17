/**
 * Ayni damda ochiq bo'lgan ro'yxatlar soni.
 *
 * Modal buni Escape bosilganda o'qiydi: ro'yxat ochiq bo'lsa, Escape avval
 * ro'yxatni yopadi, modalni emas. Boshqa yo'l yo'q — Radix `keydown` ni
 * hujjatda ushlash bosqichida tinglaydi va modal ochilganda ro'yxatdan oldin
 * ro'yxatdan o'tadi, ya'ni hodisani undan oldin to'xtatib bo'lmaydi. Radix esa
 * o'z `onEscapeKeyDown` ida `defaultPrevented` ni tekshiradi — modal aynan
 * shu yerda to'xtatiladi.
 */
let openCount = 0;

export const isComboboxOpen = () => openCount > 0;

/** Ochiq ro'yxatni hisobga qo'shadi (`Select` ham shu hisobda); qaytgani — ayirish. */
export const trackOpenList = () => {
    openCount += 1;
    return () => {
        openCount -= 1;
    };
};
