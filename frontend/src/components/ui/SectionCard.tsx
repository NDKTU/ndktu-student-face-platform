import type React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

/**
 * Bo'lim kartochkasi — dars sahifasi va kursning «Fan topshiriqlari».
 *
 * Har bir bo'lim bir xil tuzilishda: chapda rangli belgi, yonida sarlavha va
 * ixtiyoriy izoh, o'ngda amal tugmasi. Belgi rangi `--stat-*` tokenidan
 * olinadi — to'q rejimda ular o'zi ochroq variantga o'tadi, shuning uchun
 * bu yerda hex yozilmaydi.
 *
 * Avval har bir `Card` o'z qo'lida yig'ilardi va sarlavhalar bir-biridan
 * farq qilardi; bitta komponent ularni bir maromga soladi.
 */
export function SectionCard({
    icon,
    tone,
    title,
    description,
    action,
    children,
}: {
    icon: React.ReactNode;
    tone: 'teal' | 'blue' | 'purple' | 'orange' | 'green';
    title: string;
    description?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    const color = `var(--stat-${tone})`;
    return (
        <Card className="overflow-hidden rounded-2xl border-border/60 transition-shadow duration-200 hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)]">
            <CardHeader className="flex-row items-center justify-between gap-3 bg-muted/30 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                    <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
                        style={{
                            color,
                            backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ['--tw-ring-color' as any]: `color-mix(in srgb, ${color} 22%, transparent)`,
                        }}
                    >
                        {icon}
                    </span>
                    <div className="min-w-0">
                        <CardTitle className="truncate text-base">{title}</CardTitle>
                        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
                    </div>
                </div>
                {action}
            </CardHeader>
            <CardContent className="space-y-4">{children}</CardContent>
        </Card>
    );
}
