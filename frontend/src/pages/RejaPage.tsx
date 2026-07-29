import { CalendarDays } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

/** O'quv reja (curriculum) — placeholder shell. Full build lands in Phase 2. */
const RejaPage = () => (
    <div className="mx-auto max-w-[1280px] space-y-6">
        <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.025em] text-foreground">O'quv reja</h1>
            <p className="mt-1.5 text-sm text-[color:var(--text-body)]">Mutaxassisliklar boʻyicha oʻquv rejalari</p>
        </div>
        <div className="rounded-[16px] border border-border bg-card shadow-card">
            <EmptyState
                icon={<CalendarDays size={22} strokeWidth={1.8} />}
                title="Tez orada"
                description="Oʻquv reja moduli ishlab chiqilmoqda."
            />
        </div>
    </div>
);

export default RejaPage;
