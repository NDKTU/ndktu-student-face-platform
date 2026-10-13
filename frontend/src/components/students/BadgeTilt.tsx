import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Eng katta og'ish burchagi (gradus). */
const MAX_TILT = 11;

interface BadgeTiltProps {
    children: React.ReactNode;
    /** `false` — bejik hali chizilmagan: karta harakatga javob bermaydi. */
    enabled: boolean;
    className?: string;
    /** Kartaning o'zi: burchaklar, soya, nisbat. */
    cardClassName?: string;
    cardStyle?: React.CSSProperties;
}

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Bejikni qo'lda ushlagandek ko'rsatadi: kursor yoki barmoq ostida karta uch
 * o'lchamda og'adi va ustida yorug'lik dog'i yuradi.
 *
 * Bu faqat ko'rinish: yuklab olinadigan JPG canvas'dan olinadi, og'ish va
 * yorug'lik unga tushmaydi.
 *
 * Burchak React holatida emas, CSS o'zgaruvchilarida: ko'rsatkich har
 * harakatida komponentni qayta chizish canvas'li oynani bekorga yuklardi.
 */
export const BadgeTilt = ({ children, enabled, className, cardClassName, cardStyle }: BadgeTiltProps) => {
    const stageRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef(0);

    useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

    // Karta paydo bo'lganda bir marta chayqaladi — uni burish mumkinligiga ishora.
    useEffect(() => {
        const card = cardRef.current;
        if (!enabled || !card || prefersReducedMotion() || typeof card.animate !== 'function') return;
        const intro = card.animate(
            [
                { transform: 'rotateX(0deg) rotateY(0deg)' },
                { transform: 'rotateX(5deg) rotateY(-13deg)', offset: 0.3 },
                { transform: 'rotateX(-4deg) rotateY(11deg)', offset: 0.68 },
                { transform: 'rotateX(0deg) rotateY(0deg)' },
            ],
            { duration: 1500, easing: 'ease-in-out', delay: 250 },
        );
        return () => intro.cancel();
    }, [enabled]);

    const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const stage = stageRef.current;
        const card = cardRef.current;
        if (!enabled || !stage || !card || prefersReducedMotion()) return;

        // O'lcham og'magan tashqi qatlamdan olinadi: og'gan kartaning
        // chegarasi burchakka qarab o'zgaradi va karta titrab qolardi.
        const rect = stage.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));

        cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            card.style.transitionDuration = '90ms';
            card.style.setProperty('--tilt-x', `${((0.5 - y) * 2 * MAX_TILT).toFixed(2)}deg`);
            card.style.setProperty('--tilt-y', `${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
            card.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
            card.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
            card.style.setProperty('--glare-opacity', '1');
        });
    };

    const handleLeave = () => {
        const card = cardRef.current;
        if (!card) return;
        cancelAnimationFrame(frameRef.current);
        card.style.transitionDuration = '600ms';
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
        card.style.setProperty('--glare-opacity', '0');
    };

    return (
        <div
            ref={stageRef}
            // `pan-y`: telefonda vertikal surish oynani aylantiradi, gorizontal
            // harakat esa kartani og'diradi.
            className={cn('touch-pan-y select-none', className)}
            style={{ perspective: '1100px' }}
            onPointerMove={handleMove}
            onPointerLeave={handleLeave}
            onPointerCancel={handleLeave}
            onPointerUp={(event) => {
                // Barmoq ko'tarilganda `pointerleave` kelmasligi mumkin.
                if (event.pointerType !== 'mouse') handleLeave();
            }}
        >
            <div
                ref={cardRef}
                className={cn('relative transition-transform ease-out will-change-transform', cardClassName)}
                style={{
                    ...cardStyle,
                    transform: 'rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))',
                }}
            >
                {children}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                    style={{
                        opacity: 'var(--glare-opacity, 0)',
                        background:
                            'radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 58%)',
                    }}
                />
            </div>
        </div>
    );
};

export default BadgeTilt;
