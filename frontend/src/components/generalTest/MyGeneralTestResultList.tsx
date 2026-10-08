import type { AttemptResult } from '@/services/generalTestService';
import { scoreClass } from '@/components/generalTest/score';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/date';

/** Foydalanuvchining o'z elementar test natijalari ro'yxati. */
export function MyGeneralTestResultList({ results }: { results: AttemptResult[] }) {
    return (
        <ul className="divide-y divide-border">
            {results.map((r) => (
                <li key={r.attempt_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                            {r.correct_answers} / {r.total_questions} to'g'ri
                            {r.finished_at ? ` · ${formatDateTime(r.finished_at)}` : ''}
                        </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', scoreClass(r.score))}>
                        {r.score}%
                    </span>
                </li>
            ))}
        </ul>
    );
}
