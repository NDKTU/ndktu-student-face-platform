import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, MapPin, Megaphone, Pencil, Pin, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { AnnouncementForm } from '@/components/announcement/AnnouncementForm';
import { RegistrationsModal } from '@/components/announcement/RegistrationsModal';
import { STATUS_LABELS, audienceLabel } from '@/components/announcement/labels';
import { useAnnouncements, useDeleteAnnouncement } from '@/hooks/useAnnouncements';
import type { Announcement, AnnouncementStatus } from '@/services/announcementService';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: AnnouncementStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Hammasi' },
    { value: 'published', label: STATUS_LABELS.published },
    { value: 'draft', label: STATUS_LABELS.draft },
    { value: 'archived', label: STATUS_LABELS.archived },
];

const STATUS_CLASS: Record<AnnouncementStatus, string> = {
    published: 'bg-success/10 text-success',
    draft: 'bg-muted text-muted-foreground',
    archived: 'bg-warning/10 text-warning',
};

export default function AnnouncementsPage() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<AnnouncementStatus | 'all'>('all');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [deleting, setDeleting] = useState<Announcement | null>(null);
    const [registrationsOf, setRegistrationsOf] = useState<Announcement | null>(null);

    const params = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            status: status === 'all' ? undefined : status,
            search: search.trim() || undefined,
        }),
        [page, status, search],
    );

    const query = useAnnouncements(params);
    const deleteAnnouncement = useDeleteAnnouncement();

    const rows = query.data?.announcements ?? [];
    const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

    const openCreate = () => { setEditing(null); setIsFormOpen(true); };
    const openEdit = (row: Announcement) => { setEditing(row); setIsFormOpen(true); };

    const confirmDelete = () => {
        if (!deleting) return;
        deleteAnnouncement.mutate(deleting.id, {
            onSuccess: () => { toast.success("E'lon o'chirildi"); setDeleting(null); },
            onError: () => toast.error("E'lonni o'chirishda xatolik"),
        });
    };

    const columns: DataTableColumn<Announcement>[] = [
        {
            key: 'title',
            header: "E'lon",
            cell: (row) => (
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        {row.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        <span className="truncate font-medium">{row.title}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {row.event_at && (
                            <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />{formatDateTime(row.event_at)}
                            </span>
                        )}
                        {row.location && (
                            <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{row.location}
                            </span>
                        )}
                    </div>
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Holati',
            hideBelow: 'sm',
            cell: (row) => (
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[row.status])}>
                    {STATUS_LABELS[row.status]}
                </span>
            ),
        },
        {
            key: 'audience',
            header: 'Kim uchun',
            hideBelow: 'md',
            cell: (row) => <span className="text-sm text-muted-foreground">{audienceLabel(row)}</span>,
        },
        {
            key: 'registrations',
            header: "Ro'yxat",
            cell: (row) =>
                row.registration_enabled ? (
                    <button
                        type="button"
                        onClick={() => setRegistrationsOf(row)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                        <Users className="h-3.5 w-3.5" />
                        {row.registered_count}
                        {row.capacity != null && <span className="text-muted-foreground">/ {row.capacity}</span>}
                    </button>
                ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                ),
        },
        {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (row) => (
                <div className="flex justify-end gap-1">
                    <PermissionGate permission="update:announcement">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label="Tahrirlash">
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                    <PermissionGate permission="delete:announcement">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleting(row)}
                            aria-label="O'chirish"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </PermissionGate>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="E'lonlar"
                description="Talabalarga xabar va tadbirlar"
                actions={
                    <PermissionGate permission="create:announcement">
                        <Button onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" /> Yangi e'lon
                        </Button>
                    </PermissionGate>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                {STATUS_FILTERS.map((filter) => (
                    <Button
                        key={filter.value}
                        size="sm"
                        variant={status === filter.value ? 'primary' : 'outline'}
                        onClick={() => { setStatus(filter.value); setPage(1); }}
                    >
                        {filter.label}
                    </Button>
                ))}
                <Input
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    placeholder="Sarlavha bo'yicha qidirish"
                    className="w-full sm:max-w-xs"
                />
            </div>

            <DataTable
                columns={columns}
                data={rows}
                rowKey={(row) => row.id}
                isLoading={query.isLoading}
                isError={query.isError}
                onRetry={() => query.refetch()}
                emptyTitle="E'lonlar yo'q"
                emptyDescription="Birinchi e'lonni qo'shing — u talabalarning bosh sahifasida ko'rinadi."
                emptyIcon={<Megaphone className="h-6 w-6" />}
                emptyAction={
                    <PermissionGate permission="create:announcement">
                        <Button onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" /> Yangi e'lon
                        </Button>
                    </PermissionGate>
                }
            />

            {totalPages > 1 && (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            )}

            <Modal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                title={editing ? "E'lonni tahrirlash" : "Yangi e'lon"}
                className="max-w-2xl"
            >
                <AnnouncementForm
                    key={editing?.id ?? 'new'}
                    editing={editing}
                    onDone={() => setIsFormOpen(false)}
                    onCancel={() => setIsFormOpen(false)}
                />
            </Modal>

            <RegistrationsModal
                announcement={registrationsOf}
                onClose={() => setRegistrationsOf(null)}
            />

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                onConfirm={confirmDelete}
                isLoading={deleteAnnouncement.isPending}
                title="E'lonni o'chirish"
                description={
                    <>
                        «{deleting?.title}» butunlay o'chiriladi.
                        {Boolean(deleting?.registered_count) && ` Unga yozilgan ${deleting?.registered_count} ta talaba ro'yxati ham yo'qoladi.`}
                    </>
                }
                confirmText="O'chirish"
            />
        </div>
    );
}
