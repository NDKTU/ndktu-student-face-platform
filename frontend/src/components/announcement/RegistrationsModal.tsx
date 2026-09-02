import * as XLSX from 'xlsx';
import { Download, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAnnouncementRegistrations } from '@/hooks/useAnnouncements';
import type { Announcement } from '@/services/announcementService';
import { formatDateTime } from '@/utils/date';

interface Props {
    announcement: Announcement | null;
    onClose: () => void;
}

/** Tadbirga yozilganlar. Bekor qilganlar ham ko'rsatiladi — kim chiqib
 *  ketgani tashkilotchiga kerak, shuning uchun qator o'chirilmaydi. */
export const RegistrationsModal = ({ announcement, onClose }: Props) => {
    const query = useAnnouncementRegistrations(announcement?.id);
    const rows = query.data?.registrations ?? [];

    const exportExcel = () => {
        if (!announcement) return;
        const sheet = XLSX.utils.json_to_sheet(
            rows.map((row, index) => ({
                '№': index + 1,
                'F.I.Sh.': row.student?.full_name ?? row.username ?? '',
                Guruh: row.student?.group_name ?? '',
                Fakultet: row.student?.faculty ?? '',
                Kurs: row.student?.level ?? '',
                Holati: row.status === 'registered' ? 'Yozilgan' : 'Bekor qilgan',
                Vaqti: formatDateTime(row.created_at),
            })),
        );
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "Ro'yxat");
        XLSX.writeFile(book, `${announcement.title.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`);
    };

    return (
        <Modal
            isOpen={Boolean(announcement)}
            onClose={onClose}
            title={announcement ? `Ro'yxat: ${announcement.title}` : "Ro'yxat"}
            className="max-w-2xl"
        >
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                        Yozilgan: <span className="font-medium text-foreground">{query.data?.active_total ?? 0}</span>
                        {announcement?.capacity != null && ` / ${announcement.capacity}`}
                    </p>
                    <Button size="sm" variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
                        <Download className="mr-2 h-4 w-4" /> Excel
                    </Button>
                </div>

                {query.isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<Users className="h-6 w-6" />}
                        title="Hali hech kim yozilmagan"
                        description="Talabalar e'lonni ochib «Ro'yxatdan o'tish» tugmasini bosgach, shu yerda ko'rinadi."
                    />
                ) : (
                    <ul className="space-y-1.5">
                        {rows.map((row) => (
                            <li
                                key={row.id}
                                className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                        {row.student?.full_name || row.username || `#${row.user_id}`}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {[row.student?.group_name, row.student?.level, formatDateTime(row.created_at)]
                                            .filter(Boolean)
                                            .join(' • ')}
                                    </p>
                                </div>
                                {row.status === 'cancelled' && (
                                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                        bekor qilgan
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Modal>
    );
};
