import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck } from 'lucide-react';

import {
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useNotifications,
    useUnreadCount,
} from '@/hooks/useNotifications';
import type { Notification } from '@/services/notificationService';

/**
 * Qo'ng'iroqcha: o'qilmagan bildirishnomalar soni va ro'yxati.
 *
 * Bildirishnoma boshqa tizimdan keladi (ROYD arizasining holati o'zgarganda),
 * ya'ni brauzerda hech qanday harakatsiz paydo bo'ladi — shuning uchun son
 * davriy so'rov bilan yangilanadi (`useUnreadCount`). Ro'yxatning o'zi esa
 * faqat oyna ochilganda so'raladi: yopiq qo'ng'iroqcha uchun 20 qator
 * yuklashning ma'nosi yo'q.
 */
export const NotificationBell = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [isOpen, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const { data: unread = 0 } = useUnreadCount();
    const { data, isLoading } = useNotifications({ page: 1, limit: 10 }, isOpen);
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();

    // Tashqariga bosilganda yopiladi — qolgan ochiluvchi menyular bilan bir xil.
    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen]);

    const open = (notification: Notification) => {
        if (!notification.is_read) markRead.mutate(notification.id);
        const requestId = notification.payload?.request_id;
        setOpen(false);
        if (typeof requestId === 'number') navigate(`/requests/${requestId}`);
    };

    const items = data?.notifications ?? [];

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setOpen((prev) => !prev)}
                className="relative flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground transition-all duration-200 hover:bg-primary/10 hover:text-primary"
                aria-label={
                    unread > 0
                        ? t('Bildirishnomalar: {{count}} o‘qilmagan', { count: unread })
                        : t('Bildirishnomalar')
                }
                aria-expanded={isOpen}
                aria-haspopup="menu"
            >
                <Bell className="h-[18px] w-[18px]" />
                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
                >
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <span className="text-sm font-semibold">{t('Bildirishnomalar')}</span>
                        {unread > 0 && (
                            <button
                                onClick={() => markAllRead.mutate()}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                {t('Hammasini o‘qilgan deb belgilash')}
                            </button>
                        )}
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {isLoading ? (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                                {t('Yuklanmoqda...')}
                            </p>
                        ) : items.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                                {t('Bildirishnoma yo‘q')}
                            </p>
                        ) : (
                            <ul>
                                {items.map((notification) => (
                                    <li key={notification.id}>
                                        <button
                                            onClick={() => open(notification)}
                                            className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 ${
                                                notification.is_read ? '' : 'bg-primary/[0.04]'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                {!notification.is_read && (
                                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                                )}
                                                <span className="truncate text-sm font-medium">
                                                    {notification.title}
                                                </span>
                                            </span>
                                            {notification.body && (
                                                <span className="line-clamp-2 text-xs text-muted-foreground">
                                                    {notification.body}
                                                </span>
                                            )}
                                            <span className="text-[11px] text-muted-foreground">
                                                {new Date(notification.created_at).toLocaleString()}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
