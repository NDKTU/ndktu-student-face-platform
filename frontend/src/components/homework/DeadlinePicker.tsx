import { addDays, toIsoDate } from '@/components/schedule/scheduleUtils';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeField } from '@/components/ui/TimeField';

interface Props {
    /** `YYYY-MM-DDTHH:MM` (mahalliy vaqt). */
    value: string;
    onChange: (value: string) => void;
}

/**
 * Uy vazifasi muddati: sana (umumiy `DatePicker`), 24 soatlik vaqt va tez
 * tanlov — «Ertaga», «7 kundan keyin». Ilgari bu yerda o'z kalendari va
 * brauzerning `<input type="time">` i bor edi: oy nomi brauzer tiliga
 * qarab chiqardi, vaqt esa inglizcha tizimda «06:00 PM» bo'lardi.
 */
export function DeadlinePicker({ value, onChange }: Props) {
    const datePart = value.slice(0, 10) || toIsoDate(new Date());
    const timePart = value.slice(11, 16) || '18:00';

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <DatePicker label="Sana" value={datePart} onChange={(next) => onChange(`${next}T${timePart}`)} />
                <TimeField label="Vaqt" value={timePart} onChange={(next) => onChange(`${datePart}T${next}`)} />
            </div>
            <div className="flex flex-wrap gap-2">
                {[
                    { label: 'Ertaga', days: 1 },
                    { label: '7 kundan keyin', days: 7 },
                ].map(({ label, days }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => onChange(`${toIsoDate(addDays(new Date(), days))}T${timePart}`)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}
