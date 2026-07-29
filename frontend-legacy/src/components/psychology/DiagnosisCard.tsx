import { AlertTriangle, Sparkles } from 'lucide-react';
import type { Diagnosis } from '@/services/psychologyService';

export function DiagnosisCard({ diagnosis }: { diagnosis: Diagnosis | null | undefined }) {
    if (!diagnosis) {
        return (
            <div className="flex items-start gap-3 rounded-xl border border-yellow-300/60 bg-yellow-50 dark:bg-yellow-950/20 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div>
                    <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200">
                        Diagnostika sozlanmagan
                    </p>
                    <p className="mt-0.5 text-xs text-yellow-800/80 dark:text-yellow-200/70">
                        Metod uchun skoring va interpretatsiya to'liq sozlanmagan. Javoblar saqlandi, ammo natija avtomatik aniqlanmadi.
                    </p>
                </div>
            </div>
        );
    }

    if (diagnosis.type === 'sum') {
        return (
            <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary/80">
                    <Sparkles className="h-3.5 w-3.5" />
                    Natija
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-2xl font-bold text-foreground">{diagnosis.label}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                        Umumiy ball: <span className="font-bold text-foreground">{diagnosis.total}</span>
                    </span>
                </div>
                {diagnosis.description && (
                    <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{diagnosis.description}</p>
                )}
            </div>
        );
    }

    // category
    return (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary/80">
                <Sparkles className="h-3.5 w-3.5" />
                Kategoriyalar bo'yicha natija
            </div>
            <div className="mt-3 flex flex-col gap-3">
                {diagnosis.categories.map(cat => (
                    <div key={cat.name} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-semibold text-foreground capitalize">{cat.name}</span>
                            <span className="text-xs text-muted-foreground">
                                Ball: <span className="font-bold text-foreground">{cat.score}</span>
                            </span>
                        </div>
                        {cat.label && (
                            <p className="mt-1 text-sm font-medium text-primary">{cat.label}</p>
                        )}
                        {cat.description && (
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{cat.description}</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
