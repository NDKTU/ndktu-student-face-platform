import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const pad = (value: number) => String(value).padStart(2, '0');
const localValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

interface Props {
    value: string;
    onChange: (value: string) => void;
}

export function DeadlinePicker({ value, onChange }: Props) {
    const parsed = new Date(value);
    const selected = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const datePart = Number.isNaN(parsed.getTime()) ? localValue(selected).slice(0, 10) : value.slice(0, 10);
    const timePart = value.slice(11, 16) || '18:00';
    const selectedMonth = datePart.slice(0, 7);
    const [view, setView] = useState<{ selectedMonth: string; month: Date } | null>(null);
    const visibleMonth = view?.selectedMonth === selectedMonth
        ? view.month
        : new Date(selected.getFullYear(), selected.getMonth(), 1);
    const [open, setOpen] = useState(false);

    const changeDate = (date: Date) => {
        onChange(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${timePart}`);
        setOpen(false);
    };
    const changeMonth = (offset: number) => setView({
        selectedMonth,
        month: new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1),
    });
    const monthStartDay = (visibleMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const today = localValue(new Date()).slice(0, 10);

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div className="relative">
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sana</label>
                    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}
                        className="flex h-11 w-full items-center gap-3 rounded-xl border border-input bg-card px-3 text-left text-sm font-medium transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        {datePart ? new Intl.DateTimeFormat('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${datePart}T12:00`)) : 'Sanani tanlang'}
                    </button>
                    {open && (
                        <div className="relative z-20 mt-2 w-full rounded-2xl border border-border bg-popover p-3 shadow-xl sm:absolute sm:w-[19rem]">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <button type="button" onClick={() => changeMonth(-1)} aria-label="Oldingi oy" className="rounded-lg p-2 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
                                <span className="text-sm font-semibold capitalize">{new Intl.DateTimeFormat('uz-UZ', { month: 'long', year: 'numeric' }).format(visibleMonth)}</span>
                                <button type="button" onClick={() => changeMonth(1)} aria-label="Keyingi oy" className="rounded-lg p-2 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
                            </div>
                            <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
                                {WEEKDAYS.map((day) => <span key={day} className="py-1.5 font-medium">{day}</span>)}
                            </div>
                            <div className="grid grid-cols-7 gap-0.5 text-center">
                                {Array.from({ length: monthStartDay }, (_, index) => <span key={`empty-${index}`} />)}
                                {Array.from({ length: daysInMonth }, (_, index) => {
                                    const day = index + 1;
                                    const date = `${visibleMonth.getFullYear()}-${pad(visibleMonth.getMonth() + 1)}-${pad(day)}`;
                                    return (
                                        <button key={date} type="button" onClick={() => changeDate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day))}
                                            aria-label={date} aria-pressed={date === datePart}
                                            className={`h-9 rounded-lg text-sm transition-colors hover:bg-primary/10 ${date === datePart ? 'bg-primary-strong font-semibold text-primary-foreground hover:bg-primary-strong' : date === today ? 'ring-1 ring-primary text-primary' : ''}`}>
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                            <button type="button" className="mt-2 w-full rounded-lg bg-primary/10 py-2 text-xs font-semibold text-primary hover:bg-primary/15" onClick={() => changeDate(new Date())}>Bugun</button>
                        </div>
                    )}
                </div>
                <div>
                    <label htmlFor="homework-deadline-time" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Vaqt</label>
                    <div className="relative">
                        <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                        <input id="homework-deadline-time" type="time" value={timePart} onChange={(event) => onChange(`${datePart}T${event.target.value}`)}
                            className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {[{ label: 'Ertaga', days: 1 }, { label: '7 kundan keyin', days: 7 }].map(({ label, days }) => (
                    <button key={label} type="button" onClick={() => {
                        const next = new Date();
                        next.setDate(next.getDate() + days);
                        next.setHours(Number(timePart.slice(0, 2)), Number(timePart.slice(3, 5)), 0, 0);
                        onChange(localValue(next));
                    }} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}
