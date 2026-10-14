import type { ZoomJoinResponse } from '@/services/zoomSessionService';

/**
 * Seans sahifasidan (`ZoomMeetingBox`) Zoom xonasiga (`zoom-room.html`) kirish
 * ruxsatini uzatish.
 *
 * Xona alohida hujjat bo'lib ochiladi (to'liq yuklash): Zoom Client View
 * butun sahifani egallaydi va o'z stillarini global qo'yadi. Imzo serverdan
 * yuz tekshiruvidan keyin olinadi va `sessionStorage` orqali — faqat shu
 * tabga — o'tkaziladi. U bir marta o'qiladi va o'chiriladi: «Orqaga»
 * tugmasi yoki keyinroq ochilgan havola yuz tekshiruvisiz qayta kiritmasin.
 */
export interface ZoomRoomTicket {
    payload: ZoomJoinResponse;
    /** Dars davomida tasodifiy yuz tekshiruvi (faqat guruh talabasi uchun). */
    faceCheck: boolean;
}

const key = (sessionId: number) => `zoom-room:${sessionId}`;

export function saveZoomRoomTicket(sessionId: number, ticket: ZoomRoomTicket) {
    sessionStorage.setItem(key(sessionId), JSON.stringify(ticket));
}

// React StrictMode effektlarni ikki marta chaqiradi — o'qilgan chipta shu
// yerda turadi, ikkinchi chaqiruv uni yo'qotmaydi.
const consumed = new Map<number, ZoomRoomTicket | null>();

export function takeZoomRoomTicket(sessionId: number): ZoomRoomTicket | null {
    if (consumed.has(sessionId)) return consumed.get(sessionId) ?? null;
    let ticket: ZoomRoomTicket | null = null;
    try {
        const raw = sessionStorage.getItem(key(sessionId));
        sessionStorage.removeItem(key(sessionId));
        ticket = raw ? (JSON.parse(raw) as ZoomRoomTicket) : null;
    } catch {
        ticket = null;
    }
    consumed.set(sessionId, ticket);
    return ticket;
}
