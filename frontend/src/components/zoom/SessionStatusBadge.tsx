import { Radio } from 'lucide-react';
import type { ZoomSession } from '@/services/zoomSessionService';
import { formatTime } from '@/utils/date';

/** «12:00 da ochiladi» / «Hozir» / «Tugagan» — talabaga tushunarli holat. */
export function SessionStatusBadge({ session }: { session: ZoomSession }) {
    if (session.status === 'open') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                <Radio className="h-3 w-3" /> Hozir
            </span>
        );
    }
    if (session.status === 'upcoming') {
        return (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {formatTime(session.opens_at)} da ochiladi
            </span>
        );
    }
    return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Tugagan</span>;
}
