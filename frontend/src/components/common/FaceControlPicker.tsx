import { cn } from '@/lib/utils';

/**
 * Yuz nazorati darajasi — test, elementar test va Zoom seansida bir xil uch
 * pog'ona, qat'iylik bo'yicha o'sib boradi. Har joy uni o'z maydoniga
 * o'giradi: test — `proctoring_mode`, Zoom — `face_check_enabled` +
 * `random_face_checks`.
 */
export type FaceControlLevel = 'off' | 'entry' | 'continuous';

const TITLES: Record<FaceControlLevel, string> = {
    off: 'Yuz nazoratisiz',
    entry: 'Faqat kirishda',
    continuous: 'Kirishda va davomida',
};

const DEFAULT_HINTS: Record<FaceControlLevel, string> = {
    off: 'Kamerasiz',
    entry: 'Boshlashda bir marta HEMIS surati bilan solishtiriladi',
    continuous: 'Kirishda tekshiriladi va davomida ham kuzatiladi',
};

const LEVELS: FaceControlLevel[] = ['off', 'entry', 'continuous'];

interface Props {
    value: FaceControlLevel;
    onChange: (level: FaceControlLevel) => void;
    /** Uchinchi pog'ona joyga qarab boshqacha ishlaydi — izoh shu yerda aniqlashtiriladi. */
    hints?: Partial<Record<FaceControlLevel, string>>;
    label?: string;
    error?: string;
}

/**
 * Yuz nazorati tanlovi — uch kartochka yonma-yon (telefonda ustma-ust).
 * Ilgari har oynada boshqacha edi: kartochkalar, ochiladigan ro'yxat va
 * «yoqish + tur» juftligi; nomlari va tartibi ham har xil edi.
 */
export function FaceControlPicker({ value, onChange, hints, label = 'Yuz nazorati', error }: Props) {
    return (
        <div className="space-y-2">
            <span className="text-sm font-medium">{label}</span>
            <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-3">
                {LEVELS.map((level) => {
                    const active = value === level;
                    return (
                        <button
                            key={level}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onChange(level)}
                            className={cn(
                                'rounded-lg border px-3 py-2 text-left transition',
                                active
                                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                                    : 'border-input hover:border-primary/50',
                            )}
                        >
                            <div className="text-sm font-medium">{TITLES[level]}</div>
                            <div className="text-xs text-muted-foreground">{hints?.[level] ?? DEFAULT_HINTS[level]}</div>
                        </button>
                    );
                })}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
