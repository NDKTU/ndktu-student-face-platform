import { useState } from 'react';
import type { ScheduleView } from '@/components/schedule/scheduleUtils';

/**
 * Tanlangan ko'rinish shu brauzerda eslab qolinadi — har sahifaning o'z
 * kaliti bilan. Saqlab bo'lmasa (maxfiy oyna, bloklangan sayt ma'lumotlari)
 * shunchaki ro'yxat ochiladi.
 */
export const useScheduleView = (storageKey: string) => {
    const [view, setViewState] = useState<ScheduleView>(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            // 'calendar' — ikki ko'rinish bo'lgan paytdagi haftalik setka.
            if (stored === 'week' || stored === 'calendar') return 'week';
            return stored === 'month' ? 'month' : 'list';
        } catch {
            return 'list';
        }
    });
    const setView = (next: ScheduleView) => {
        setViewState(next);
        try {
            localStorage.setItem(storageKey, next);
        } catch {
            // Saqlanmasa ham sahifa ishlayveradi.
        }
    };
    return [view, setView] as const;
};
