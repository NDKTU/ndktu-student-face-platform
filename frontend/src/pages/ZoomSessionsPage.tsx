import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClock, Pencil, Plus, Radio, ScanFace, Trash2, UsersRound, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabBar, type TabDef } from '@/components/ui/TabBar';
import { ZoomSessionFormModal } from '@/components/zoom/ZoomSessionFormModal';
import { SessionStatusBadge } from '@/components/zoom/SessionStatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useDeleteZoomSession, useSaveZoomSession, useZoomSessions } from '@/hooks/useZoomSessions';
import type { ZoomSession, ZoomSessionScope } from '@/services/zoomSessionService';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDate, formatTime } from '@/utils/date';
import { cn } from '@/lib/utils';

const TABS: TabDef<ZoomSessionScope>[] = [
    { id: 'now', label: 'Hozir', icon: <Radio className="h-4 w-4" /> },
    { id: 'upcoming', label: 'Keyingi', icon: <CalendarClock className="h-4 w-4" /> },
    { id: 'past', label: "O'tgan", icon: <Video className="h-4 w-4" /> },
];

const EMPTY: Record<ZoomSessionScope, string> = {
    now: "Hozir ochiq seans yo'q.",
    upcoming: "Rejalashtirilgan seans yo'q.",
    past: "O'tgan seanslar yo'q.",
};

/**
 * «Zoom» — jonli dars seanslari. Talaba faqat o'z guruhining seanslarini
 * ko'radi; yaratuvchi va admin — o'zlarinikini (admin — hammasini).
 */
export default function ZoomSessionsPage() {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const canCreate = hasPermission('create:zoom_session');
    const [scope, setScope] = useState<ZoomSessionScope>('now');
    const { data: sessions, isLoading, isError, refetch } = useZoomSessions(scope);
    const save = useSaveZoomSession();
    const remove = useDeleteZoomSession();
    const [editing, setEditing] = useState<ZoomSession | null | 'new'>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [toDelete, setToDelete] = useState<ZoomSession | null>(null);

    const closeForm = () => {
        setEditing(null);
        setFormError(null);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Zoom"
                description="Jonli darslar — guruhingiz uchun belgilangan vaqtda"
                actions={
                    canCreate && (
                        <Button onClick={() => setEditing('new')}>
                            <Plus className="h-4 w-4" /> Seans qo'shish
                        </Button>
                    )
                }
            />
            <TabBar tabs={TABS} active={scope} onChange={setScope} />

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                    ))}
                </div>
            ) : isError ? (
                <ErrorState onRetry={() => refetch()} />
            ) : !sessions?.length ? (
                <Card>
                    <EmptyState icon={<Video className="h-6 w-6" />} title={EMPTY[scope]} description="Seans o'qituvchi tomonidan belgilanadi." />
                </Card>
            ) : (
                <div className="space-y-2">
                    {sessions.map((session) => (
                        <div
                            key={session.id}
                            className={cn(
                                'flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:gap-4',
                                !session.is_active && 'opacity-60',
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium text-foreground">{session.title}</p>
                                    <SessionStatusBadge session={session} />
                                    {!session.is_active && <span className="text-xs text-muted-foreground">o'chirilgan</span>}
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        {formatDate(session.starts_at)}, {formatTime(session.starts_at)}–{formatTime(session.ends_at)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <UsersRound className="h-3.5 w-3.5" />
                                        {session.groups.map((g) => g.name).join(', ')}
                                    </span>
                                    {session.face_check_enabled && (
                                        <span className="inline-flex items-center gap-1">
                                            <ScanFace className="h-3.5 w-3.5" /> Yuz nazorati
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                {session.can_manage && (
                                    <>
                                        <Button variant="ghost" size="sm" aria-label="Tahrirlash" onClick={() => setEditing(session)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" aria-label="O'chirish" onClick={() => setToDelete(session)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </>
                                )}
                                <Button
                                    size="sm"
                                    variant={session.status === 'open' ? 'primary' : 'outline'}
                                    onClick={() => navigate(`/zoom/${session.id}`)}
                                >
                                    {session.status === 'open' && !session.can_manage ? "Qo'shilish" : 'Ochish'}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing !== null && (
                <ZoomSessionFormModal
                    editing={editing === 'new' ? null : editing}
                    onClose={closeForm}
                    isPending={save.isPending}
                    error={formError}
                    onSubmit={(data) =>
                        save.mutate(
                            { id: editing === 'new' ? undefined : editing.id, data },
                            {
                                onSuccess: () => {
                                    toast.success('Seans saqlandi');
                                    closeForm();
                                },
                                onError: (e) => setFormError(apiErrorMessage(e, "Seansni saqlab bo'lmadi")),
                            },
                        )
                    }
                />
            )}

            <ConfirmDialog
                isOpen={toDelete !== null}
                onClose={() => setToDelete(null)}
                onConfirm={() =>
                    toDelete &&
                    remove.mutate(toDelete.id, {
                        onSuccess: () => {
                            toast.success("Seans o'chirildi");
                            setToDelete(null);
                        },
                        onError: (e) => toast.error(apiErrorMessage(e, "O'chirib bo'lmadi")),
                    })
                }
                title="Seansni o'chirasizmi?"
                description="Seans va uning yuz nazorati hisoboti o'chiriladi."
                confirmText="O'chirish"
                isLoading={remove.isPending}
            />
        </div>
    );
}
