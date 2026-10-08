import type { SyntheticEvent } from 'react';

/**
 * Test paytida nusxalash, kesish, uzoq bosish menyusi va sudrashni o'chiradi:
 * savolni ChatGPT'ga ko'chirib qo'yish bir harakat bo'lmasin. Javob maydoni
 * (`input`, `textarea`) bundan mustasno, aks holda uni tahrirlab bo'lmaydi.
 *
 * Konteynerga `select-none [-webkit-touch-callout:none]` bilan birga qo'yiladi.
 */
export const blockCopy = (event: SyntheticEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea')) return;
    event.preventDefault();
};

export const noCopyHandlers = {
    onCopy: blockCopy,
    onCut: blockCopy,
    onContextMenu: blockCopy,
    onDragStart: blockCopy,
};
