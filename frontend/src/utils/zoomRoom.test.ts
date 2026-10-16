import { describe, expect, it } from 'vitest';
import { saveZoomRoomTicket, takeZoomRoomTicket, type ZoomRoomTicket } from './zoomRoom';

const ticket = { payload: { signature: 'sig' }, faceCheck: true } as unknown as ZoomRoomTicket;

describe('Zoom xonasi chiptasi', () => {
    it('bir marta o\'qiladi va sessionStorage dan o\'chiriladi', () => {
        saveZoomRoomTicket(101, ticket);
        expect(takeZoomRoomTicket(101)).toEqual(ticket);
        // «Orqaga» yoki eski havola yuz tekshiruvisiz kira olmasin.
        expect(sessionStorage.getItem('zoom-room:101')).toBeNull();
    });

    it('StrictMode ikkinchi chaqiruvi o\'sha chiptani oladi', () => {
        saveZoomRoomTicket(102, ticket);
        expect(takeZoomRoomTicket(102)).toEqual(ticket);
        expect(takeZoomRoomTicket(102)).toEqual(ticket);
    });

    it('chipta yo\'q yoki buzilgan — null', () => {
        expect(takeZoomRoomTicket(103)).toBeNull();
        sessionStorage.setItem('zoom-room:104', '{buzilgan');
        expect(takeZoomRoomTicket(104)).toBeNull();
    });
});
