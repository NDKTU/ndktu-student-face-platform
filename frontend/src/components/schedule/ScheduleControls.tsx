import { useTranslation } from 'react-i18next';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
    MONTHS,
    addDays,
    addMonths,
    monthStartOf,
    mondayOf,
    toIsoDate,
    type ScheduleView,
} from './scheduleUtils';

export const ViewToggle = ({
    view,
    onChange,
}: {
    view: ScheduleView;
    onChange: (view: ScheduleView) => void;
}) => {
    const { t } = useTranslation();
    const options = [
        { id: 'list' as const, label: t("Ro'yxat"), icon: List },
        { id: 'week' as const, label: t('Hafta'), icon: CalendarRange },
        { id: 'month' as const, label: t('Oy'), icon: CalendarDays },
    ];
    return (
        <div role="radiogroup" aria-label={t("Ko'rinish")} className="flex rounded-lg border border-border bg-card p-0.5">
            {options.map(({ id, label, icon: Icon }) => {
                const active = view === id;
                return (
                    <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(id)}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
};

/** ‹ «Bugun» › — hafta va oy uchun umumiy. */
const PeriodNav = ({
    label,
    todayLabel,
    isCurrent,
    onPrev,
    onToday,
    onNext,
    prevLabel,
    nextLabel,
}: {
    label?: string;
    todayLabel: string;
    isCurrent: boolean;
    onPrev: () => void;
    onToday: () => void;
    onNext: () => void;
    prevLabel: string;
    nextLabel: string;
}) => (
    <div className="flex items-center gap-2">
        {label && <span className="min-w-[8.5rem] text-right font-semibold text-foreground">{label}</span>}
        <Button variant="outline" size="icon" onClick={onPrev} aria-label={prevLabel}>
            <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant={isCurrent ? 'secondary' : 'outline'} onClick={onToday} disabled={isCurrent}>
            {todayLabel}
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} aria-label={nextLabel}>
            <ChevronRight className="h-4 w-4" />
        </Button>
    </div>
);

export const WeekNav = ({
    weekStart,
    onChange,
}: {
    weekStart: Date;
    onChange: (weekStart: Date) => void;
}) => {
    const { t } = useTranslation();
    return (
        <PeriodNav
            todayLabel={t('Bu hafta')}
            isCurrent={toIsoDate(weekStart) === toIsoDate(mondayOf(new Date()))}
            onPrev={() => onChange(addDays(weekStart, -7))}
            onToday={() => onChange(mondayOf(new Date()))}
            onNext={() => onChange(addDays(weekStart, 7))}
            prevLabel={t('Oldingi hafta')}
            nextLabel={t('Keyingi hafta')}
        />
    );
};

export const MonthNav = ({
    monthStart,
    onChange,
}: {
    monthStart: Date;
    onChange: (monthStart: Date) => void;
}) => {
    const { t } = useTranslation();
    return (
        <PeriodNav
            label={`${t(MONTHS[monthStart.getMonth()])} ${monthStart.getFullYear()}`}
            todayLabel={t('Bugun')}
            isCurrent={toIsoDate(monthStart) === toIsoDate(monthStartOf(new Date()))}
            onPrev={() => onChange(addMonths(monthStart, -1))}
            onToday={() => onChange(monthStartOf(new Date()))}
            onNext={() => onChange(addMonths(monthStart, 1))}
            prevLabel={t('Oldingi oy')}
            nextLabel={t('Keyingi oy')}
        />
    );
};
