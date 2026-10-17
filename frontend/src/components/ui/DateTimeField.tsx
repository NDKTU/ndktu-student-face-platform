import { DatePicker } from '@/components/ui/DatePicker';
import { TimeField } from '@/components/ui/TimeField';

interface Props {
    /** `YYYY-MM-DDTHH:MM` (mahalliy vaqt, `datetime-local` bilan bir xil) yoki bo'sh. */
    value: string;
    onChange: (value: string) => void;
    label?: string;
    /** Sana tanlanganda vaqt bo'sh bo'lsa — shu qo'yiladi. */
    defaultTime?: string;
    clearable?: boolean;
    placeholder?: string;
}

/**
 * Sana + vaqt — `<input type="datetime-local">` o'rniga. U ham brauzer tilida
 * chiziladi («10/17/2026, 02:30 PM»); bu yerda sana — o'zimizning kalendar,
 * vaqt — 24 soatlik maydon. Qiymat formati o'zgarmagan, shuning uchun
 * formalar avvalgidek ishlaydi.
 */
export function DateTimeField({ value, onChange, label, defaultTime = '09:00', clearable = true, placeholder }: Props) {
    const date = value.slice(0, 10);
    const time = value.slice(11, 16);
    return (
        <div className="space-y-1.5">
            {label && <span className="text-sm font-medium text-foreground">{label}</span>}
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                <DatePicker
                    value={date}
                    onChange={(next) => onChange(next ? `${next}T${time || defaultTime}` : '')}
                    clearable={clearable}
                    placeholder={placeholder}
                    format="short"
                    ariaLabel={label ? `${label}: sana` : 'Sana'}
                />
                <TimeField
                    value={time}
                    onChange={(next) => onChange(`${date}T${next}`)}
                    disabled={!date}
                    ariaLabel={label ? `${label}: vaqt` : 'Vaqt'}
                />
            </div>
        </div>
    );
}
