import { Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/SwitchField';
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
 * «Yuz ko'rinmasa testni yakunlash» — faqat «Kirishda va davomida» rejimida.
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
        <SwitchField
            id="quiz-no-face-finish"
            title="Yuz ko'rinmasa testni yakunlash"
            description={
                canEdit
                    ? "Kadrda yuz belgilangan vaqtdan ko'p ko'rinmasa — test suratli dalil bilan yakunlanadi. Ogohlantirish (5 soniya) har doim ishlaydi"
                    : "Bu sozlamani faqat ruxsati bor foydalanuvchi o'zgartiradi"
            }
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={(checked) => onChange(checked ? DEFAULT_SECONDS : null)}
        >
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
        </SwitchField>
    );
}
