import { Eye, EyeOff } from 'lucide-react';
import type { useHoldToReveal } from '@/hooks/useHoldToReveal';
import { cn } from '@/lib/utils';

type Reveal = ReturnType<typeof useHoldToReveal>;

/**
 * Pastga qotirilgan «ko'rish» tugmasi. Bosh barmoq yetadigan joyda: bir qo'l
 * bilan bosib turib, ikkinchisi bilan variantni tanlash mumkin.
 *
 * `touch-none`: aks holda brauzer barmoq siljishini aylantirish deb olib,
 * `pointercancel` yuborardi va matn o'qish o'rtasida yopilardi.
 */
export function HoldToRevealBar({ reveal }: { reveal: Reveal }) {
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] px-4 pb-4 mb-safe">
            <button
                type="button"
                {...reveal.holdProps}
                className={cn(
                    'pointer-events-auto mx-auto flex h-14 w-full max-w-4xl touch-none select-none items-center justify-center gap-2 rounded-2xl border text-sm font-semibold shadow-lg [-webkit-touch-callout:none]',
                    reveal.holding
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground',
                )}
            >
                {reveal.holding ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                {reveal.holding ? "Matn ko'rinmoqda" : "Bosib turing — savol ko'rinadi"}
            </button>
        </div>
    );
}
