import { usePairTimes } from '@/hooks/useZoomSessions';
import type { PairTime } from '@/services/zoomSessionService';
import { cn } from '@/lib/utils';
import { pairRange } from '@/utils/dateTimeInput';

interface Props {
    start: string;
    end: string;
    onChange: (start: string, end: string) => void;
}

/**
 * Juftlik bo'yicha vaqt: bosilsa boshlanish va tugash birdan qo'yiladi.
 * Tanlanganning yonidagi juftlik bosilsa — qo'shiladi (2+3 → 09:30–12:20,
 * qo'sh para). Boshqasi bosilsa — tanlov o'shanga o'tadi.
 */
export function PairPicker({ start, end, onChange }: Props) {
    const { data: pairs = [] } = usePairTimes();
    if (pairs.length === 0) return null;
    const range = pairRange(pairs, start, end);
    const byNumber = new Map(pairs.map((pair) => [pair.pair, pair]));

    const choose = (pair: PairTime) => {
        let [first, last] = [pair.pair, pair.pair];
        if (range && pair.pair === range[1] + 1) [first, last] = [range[0], pair.pair];
        else if (range && pair.pair === range[0] - 1) [first, last] = [pair.pair, range[1]];
        onChange(byNumber.get(first)!.start, byNumber.get(last)!.end);
    };

    return (
        <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Juftlik</span>
            <div role="group" aria-label="Juftlik" className="grid grid-cols-3 gap-1.5 sm:grid-cols-9">
                {pairs.map((pair) => {
                    const active = Boolean(range && pair.pair >= range[0] && pair.pair <= range[1]);
                    return (
                        <button
                            key={pair.pair}
                            type="button"
                            onClick={() => choose(pair)}
                            aria-pressed={active}
                            title={`${pair.pair}-juftlik: ${pair.start}–${pair.end}`}
                            className={cn(
                                'rounded-lg border px-1 py-1.5 text-center transition-colors',
                                active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-input hover:border-primary/60 hover:bg-primary/5',
                            )}
                        >
                            <span className="block text-sm font-semibold">{pair.pair}</span>
                            <span className={cn('block text-[10px] tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                                {pair.start}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
