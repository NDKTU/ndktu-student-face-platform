import { Clock, MapPin, User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScheduleLesson } from '@/services/hemisScheduleService';
import { lessonTime, trainingTone } from './scheduleUtils';

interface LessonCardProps {
    lesson: ScheduleLesson;
    /**
     * O'qituvchi ko'rinishida bir juftlikda bir nechta guruh bo'lishi mumkin
     * (oqim) — ular bitta kartochkaga yig'iladi.
     */
    groups?: string[];
    /** Kimni ko'rsatish: o'qituvchiga — guruh(lar), talabaga — o'qituvchi. */
    show: 'groups' | 'teacher';
}

export const LessonCard = ({ lesson, groups, show }: LessonCardProps) => {
    const { t } = useTranslation();
    const place = [lesson.auditorium_name, lesson.building_name].filter(Boolean).join(' · ');
    const groupNames = groups?.length ? groups : [lesson.group_name].filter(Boolean);

    return (
        <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/5 py-2 text-primary">
                <span className="text-lg font-bold leading-none">{lesson.lesson_pair || '—'}</span>
                <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t('para')}
                </span>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    {lesson.training_type && (
                        <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${trainingTone(lesson.training_type_code)}`}
                        >
                            {lesson.training_type}
                        </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        <Clock className="h-3.5 w-3.5" />
                        {lessonTime(lesson)}
                    </span>
                </div>
                <p className="font-medium leading-snug text-foreground">{lesson.subject_name}</p>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {place && (
                        <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{place}</span>
                        </span>
                    )}
                    {show === 'groups' && groupNames.length > 0 && (
                        <span className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{groupNames.join(', ')}</span>
                        </span>
                    )}
                    {show === 'teacher' && lesson.employee_name && (
                        <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{lesson.employee_name}</span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
