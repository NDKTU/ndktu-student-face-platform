import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useAuth } from '@/context/AuthContext';
import { NO_FACE_FINISH_PERMISSION } from './noFaceFinish';

const MIN_SECONDS = 15;
const MAX_SECONDS = 600;
const DEFAULT_SECONDS = 60;

interface Props {
    /** `null` — o'chiq. */
    value: number | null;
    onChange: (value: number | null) => void;
}

/**
 * «Yuz ko'rinmasa testni yakunlash» — faqat «Kamera bilan» rejimida.
 *
 * Avtomatik yakunlash jiddiy jazo, shuning uchun uni faqat ruxsati bor
 * foydalanuvchi o'zgartiradi; qolganlar holatni ko'radi, xolos. Ruxsatsiz
 * foydalanuvchi formasi bu maydonni serverga yubormaydi — server ham uni
 * tekshiradi. Ogohlantirish esa (5 soniya yuz yo'q) har doim ishlaydi.
 */
export function NoFaceFinishField({ value, onChange }: Props) {
    const { hasPermission } = useAuth();
    const canEdit = hasPermission(NO_FACE_FINISH_PERMISSION);
    const enabled = value != null;

    return (
        <div className="space-y-2 rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-4">
                <label htmlFor="quiz-no-face-finish" className={canEdit ? 'cursor-pointer' : undefined}>
                    <div className="text-sm font-medium">Yuz ko'rinmasa testni yakunlash</div>
                    <div className="text-xs text-muted-foreground">
                        {canEdit
                            ? "Kadrda yuz belgilangan vaqtdan ko'p ko'rinmasa — test suratli dalil bilan yakunlanadi. Ogohlantirish (5 soniya) har doim ishlaydi"
                            : "Bu sozlamani faqat ruxsati bor foydalanuvchi o'zgartiradi"}
                    </div>
                </label>
                <Switch
                    id="quiz-no-face-finish"
                    checked={enabled}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => onChange(checked ? DEFAULT_SECONDS : null)}
                />
            </div>
            {enabled && (
                <div className="flex items-center gap-2 text-sm">
                    <Input
                        type="number"
                        min={MIN_SECONDS}
                        max={MAX_SECONDS}
                        value={value ?? DEFAULT_SECONDS}
                        disabled={!canEdit}
                        onChange={(e) => onChange(Number(e.target.value) || MIN_SECONDS)}
                        className="w-24"
                        aria-label="Necha soniyadan keyin"
                    />
                    <span className="text-muted-foreground">
                        soniya yuz ko'rinmasa ({MIN_SECONDS}–{MAX_SECONDS})
                    </span>
                </div>
            )}
        </div>
    );
}
