import React from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Kartochka sarlavhasidagi amal tugmasi.
 *
 * Telefonda faqat belgi qoladi, yozuv `sm` dan boshlab qo'shiladi.
 * Sabab: «Excel'dan yuklash» kabi uzun yozuvlar 360px enda sarlavhani ikki
 * qatorga bo'lib, kartochkaning yarmini egallab turardi. Belgi esa o'sha
 * amalni bitta kvadratda ko'rsatadi.
 *
 * Yozuv yo'qolganda tugma ma'nosini `aria-label` va `title` saqlaydi —
 * skrinrider ham, sichqoncha ostidagi maslahat ham o'sha matnni beradi.
 */
export const CardAction = ({
    icon,
    label,
    className,
    title,
    ...props
}: React.ComponentProps<typeof Button> & { icon: React.ReactNode; label: string }) => (
    <Button
        size="sm"
        aria-label={label}
        title={title ?? label}
        // Telefonda kvadratga yaqin: yozuvsiz tugmada keng yon bo'shliq
        // ortiqcha. `Button` ning `gap-2` si yashirilgan yozuvga bo'shliq
        // qo'shmaydi, shuning uchun belgi markazda qoladi.
        className={cn('shrink-0 px-2.5 sm:px-3', className)}
        {...props}
    >
        {icon}
        <span className="hidden sm:inline">{label}</span>
    </Button>
);
