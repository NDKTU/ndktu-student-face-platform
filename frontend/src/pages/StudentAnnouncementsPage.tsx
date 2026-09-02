import { useState } from 'react';
import { toast } from 'sonner';
import { Megaphone } from 'lucide-react';
import { AnnouncementCard } from '@/components/announcement/AnnouncementCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAnnouncementFeed, useToggleRegistration } from '@/hooks/useAnnouncements';
import type { Announcement } from '@/services/announcementService';

const PAGE_SIZE = 12;

export default function StudentAnnouncementsPage() {
    const [page, setPage] = useState(1);
    const [onlyEvents, setOnlyEvents] = useState(false);

    const query = useAnnouncementFeed({ page, limit: PAGE_SIZE, only_events: onlyEvents || undefined });
    const toggle = useToggleRegistration();

    const rows = query.data?.announcements ?? [];
    const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

    const onToggle = (announcement: Announcement) => {
        toggle.mutate(
            { id: announcement.id, registered: announcement.is_registered },
            {
                onSuccess: (data) =>
                    toast.success(data.is_registered ? "Ro'yxatdan o'tdingiz" : "Yozilish bekor qilindi"),
                onError: (cause) => {
                    const detail = (cause as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    toast.error(typeof detail === 'string' ? detail : 'Amalni bajarib bo\'lmadi');
                },
            },
        );
    };

    if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

    return (
        <div className="space-y-6">
            <PageHeader title="E'lonlar" description="Universitet xabarlari va tadbirlari" />

            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    variant={onlyEvents ? 'outline' : 'primary'}
                    onClick={() => { setOnlyEvents(false); setPage(1); }}
                >
                    Hammasi
                </Button>
                <Button
                    size="sm"
                    variant={onlyEvents ? 'primary' : 'outline'}
                    onClick={() => { setOnlyEvents(true); setPage(1); }}
                >
                    Tadbirlar
                </Button>
            </div>

            {query.isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-56 w-full rounded-2xl" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={<Megaphone className="h-6 w-6" />}
                    title="E'lonlar yo'q"
                    description="Yangi e'lon chiqqanda u shu yerda va bosh sahifada ko'rinadi."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {rows.map((announcement) => (
                        <AnnouncementCard
                            key={announcement.id}
                            announcement={announcement}
                            onToggle={onToggle}
                            isPending={toggle.isPending && toggle.variables?.id === announcement.id}
                        />
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            )}
        </div>
    );
}
