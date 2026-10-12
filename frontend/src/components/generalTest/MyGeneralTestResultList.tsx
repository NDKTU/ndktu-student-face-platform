import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { AttemptResult } from '@/services/generalTestService';
import { scoreClass } from '@/components/generalTest/score';
import { myElementarReview } from '@/components/generalTest/studentPaths';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/date';

/** Foydalanuvchining o'z elementar test natijalari ro'yxati; qator tahlilni ochadi. */
export function MyGeneralTestResultList({ results }: { results: AttemptResult[] }) {
    return (
        <ul className="divide-y divide-border">
            {results.map((r) => (
                <li key={r.attempt_id}>
                    <Link
                        to={myElementarReview(r.attempt_id)}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                            <p className="text-xs text-muted-foreground">
                                {r.correct_answers} / {r.total_questions} to'g'ri
                                {r.finished_at ? ` · ${formatDateTime(r.finished_at)}` : ''}
                            </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5">
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', scoreClass(r.score))}>
                                {r.score}%
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
