/**
 * Daraja ranglari. Darajalar tartibli (past → yuqori), shuning uchun bitta
 * rangning to'yinganlik zinapoyasi olinadi; xavf guruhi — alohida qizil.
 * Rang yolg'iz emas: har doim yonida daraja nomi va raqam turadi.
 */
export const RISK_COLOR = 'var(--destructive)';
export const UNDETERMINED_COLOR = 'var(--muted-foreground)';

export function levelColor(index: number, total: number, risk: boolean): string {
    if (risk) return RISK_COLOR;
    const share = total <= 1 ? 100 : 35 + Math.round((65 * index) / (total - 1));
    return `color-mix(in srgb, var(--primary) ${share}%, var(--card))`;
}

export function levelColorMap(labels: string[], riskLabels: ReadonlySet<string>): Record<string, string> {
    return Object.fromEntries(labels.map((label, i) => [label, levelColor(i, labels.length, riskLabels.has(label))]));
}
