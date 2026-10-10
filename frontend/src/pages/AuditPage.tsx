import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { History, LogIn, LogOut, ShieldAlert, XCircle } from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { useUrlNumberState, useUrlState } from '@/hooks/useUrlState';
import { useAuditEvents, useAuditLogs } from '@/hooks/useAudit';
import { apiErrorMessage } from '@/utils/apiError';
import type { AuditLog } from '@/services/auditService';

const PAGE_SIZE = 50;

/**
 * Hodisa nomlari. Server texnik kalit beradi (`login`, `question.deleted`) —
 * uni to'g'ridan-to'g'ri ko'rsatsak, jurnal o'qilmas bo'lardi. Tanimagan
 * kalit o'z holicha chiqadi: yangi hodisa qo'shilsa, bo'sh katak emas.
 */
const EVENT_LABEL: Record<string, string> = {
    login: 'Kirdi',
    login_failed: 'Kirish muvaffaqiyatsiz',
    logout: 'Chiqdi',
    session_evicted: 'Sessiya tugatildi',
    'user.created': 'Foydalanuvchi yaratildi',
    'user.updated': 'Foydalanuvchi tahrirlandi',
    'user.deleted': "Foydalanuvchi o'chirildi",
    'user.role_changed': "Rol o'zgartirildi",
    'user.data_scope_changed': "Ko'rish doirasi o'zgartirildi",
    'user.password_changed': "Parol o'zgartirildi",
    'question.deleted': "Savol o'chirildi",
    'question.bulk_deleted': "Savollar ommaviy o'chirildi",
    'quiz.deleted': "Test o'chirildi",
    'result.deleted': "Natija o'chirildi",
    'sync.run': 'Sinxronizatsiya',
};

const EVENT_TONE: Record<string, string> = {
    login: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    login_failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
    logout: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
    session_evicted: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const EVENT_ICON: Record<string, typeof LogIn> = {
    login: LogIn,
    login_failed: XCircle,
    logout: LogOut,
    session_evicted: ShieldAlert,
};

const EventBadge = ({ event }: { event: string }) => {
    const { t } = useTranslation();
    const Icon = EVENT_ICON[event];
    return (
        <span
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                EVENT_TONE[event] ?? 'bg-primary/10 text-primary'
            }`}
        >
            {Icon && <Icon className="h-3 w-3" />}
            {t(EVENT_LABEL[event] ?? event)}
        </span>
    );
};

const Who = ({ log }: { log: AuditLog }) => (
    <div className="min-w-0">
        <p className="truncate text-sm font-medium">{log.full_name || log.username || '—'}</p>
        {log.full_name && log.username && (
            <p className="truncate font-mono text-[11px] text-muted-foreground">{log.username}</p>
        )}
    </div>
);

const AuditPage = () => {
    const { t } = useTranslation();

    const [page, setPage] = useUrlNumberState('page', 1);
    const [search, setSearch] = useUrlState<string>('q', '');
    const [event, setEvent] = useUrlState<string>('event', 'all');
    const [dateFrom, setDateFrom] = useUrlState<string>('from', '');
    const [dateTo, setDateTo] = useUrlState<string>('to', '');

    // Qidiruv har harfda so'rov yubormasin: jurnalda millionlab qator
    // bo'lishi mumkin.
    const [debounced, setDebounced] = useState(search);
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebounced(search);
            setPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [search]);

    const { data, isLoading, isError, error, refetch } = useAuditLogs({
        page,
        limit: PAGE_SIZE,
        search: debounced || undefined,
        event: event === 'all' ? undefined : event,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
    });
    const { data: events } = useAuditEvents();

    const eventOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha hodisalar') },
            ...(events ?? []).map((item) => ({
                value: item.value,
                label: `${t(EVENT_LABEL[item.value] ?? item.value)} (${item.count})`,
            })),
        ],
        [events, t],
    );

    const logs = data?.logs ?? [];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('Audit jurnali')}
                description={t('Kim qachon tizimga kirgan, chiqqan va nima qilgan')}
            />

            <Card>
                <CardContent className="flex flex-wrap items-end gap-3 p-4">
                    <div className="w-full sm:w-[260px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            {t('Qidirish')}
                        </label>
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('Ism, login yoki IP')}
                        />
                    </div>
                    <div className="w-full sm:w-[240px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            {t('Hodisa')}
                        </label>
                        <Combobox
                            options={eventOptions}
                            value={event}
                            onChange={(value) => {
                                setEvent(value);
                                setPage(1);
                            }}
                            placeholder={t('Barcha hodisalar')}
                            searchPlaceholder={t('Hodisa...')}
                        />
                    </div>
                    <div className="w-[150px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            {t('Sanadan')}
                        </label>
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => {
                                setDateFrom(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                    <div className="w-[150px]">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            {t('Sanagacha')}
                        </label>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => {
                                setDateTo(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                </CardContent>
            </Card>

            {isError ? (
                <ErrorState
                    title={t('Jurnalni olib bo‘lmadi')}
                    description={apiErrorMessage(error, t('Keyinroq urinib ko‘ring'))}
                    onRetry={() => refetch()}
                />
            ) : isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                    ))}
                </div>
            ) : logs.length === 0 ? (
                <EmptyState
                    icon={<History className="h-10 w-10" />}
                    title={t('Yozuv yo‘q')}
                    description={t('Tanlangan shartlarga mos yozuv topilmadi.')}
                />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">{t('Vaqt')}</TableHead>
                                        <TableHead>{t('Kim')}</TableHead>
                                        <TableHead>{t('Hodisa')}</TableHead>
                                        <TableHead>{t('Tafsilot')}</TableHead>
                                        <TableHead className="whitespace-nowrap">IP</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                {new Date(log.created_at).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Who log={log} />
                                            </TableCell>
                                            <TableCell>
                                                <EventBadge event={log.event} />
                                            </TableCell>
                                            <TableCell className="max-w-[420px]">
                                                <p className="truncate text-sm">{log.summary || '—'}</p>
                                                {log.user_agent && (
                                                    <p
                                                        className="truncate text-[11px] text-muted-foreground"
                                                        title={log.user_agent}
                                                    >
                                                        {log.user_agent}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap font-mono text-xs">
                                                {log.ip || '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {totalPages > 1 && (
                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    totalItems={data?.total}
                    pageSize={PAGE_SIZE}
                />
            )}
        </div>
    );
};

export default AuditPage;
