import { Settings } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

/** Sozlamalar (settings) — placeholder shell. Full build (2FA, email notifs) lands in Phase 5. */
const SettingsPage = () => (
    <div className="mx-auto max-w-[1280px] space-y-6">
        <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.025em] text-foreground">Sozlamalar</h1>
            <p className="mt-1.5 text-sm text-[color:var(--text-body)]">Hisob va xavfsizlik sozlamalari</p>
        </div>
        <div className="rounded-[16px] border border-border bg-card shadow-card">
            <EmptyState
                icon={<Settings size={22} strokeWidth={1.8} />}
                title="Tez orada"
                description="Sozlamalar moduli ishlab chiqilmoqda."
            />
        </div>
    </div>
);

export default SettingsPage;
