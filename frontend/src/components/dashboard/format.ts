import type { CSSProperties } from 'react';

/** Dashboard sahifalari uchun umumiy formatlash va diagramma uslublari. */

export const CHART_TOOLTIP_STYLE: CSSProperties = {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: '0.5rem',
    color: 'var(--popover-foreground)',
    fontSize: 13,
};
export const CHART_AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };
export const CHART_CURSOR = { fill: 'color-mix(in srgb, var(--primary) 6%, transparent)' };

/** Foiz yoki «—»: `null` — hali hisoblanmagan, 0% emas. */
export const percentText = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : `${value}%`;

export const gradeText = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : value.toFixed(2);

/** Davomat foizining ohangi. Rang yolg'iz emas — raqamning o'zi yonida turadi. */
export const attendanceTone = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'text-muted-foreground';
    if (value >= 85) return 'text-success';
    if (value >= 70) return 'text-amber-600 dark:text-amber-400';
    return 'text-destructive';
};
