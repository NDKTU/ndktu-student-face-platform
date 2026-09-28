import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileText, Plus } from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { useUrlNumberState, useUrlState } from '@/hooks/useUrlState';
import { useRoleView } from '@/hooks/useRoleView';
import { useCreateRoydRequest, useRoydCatalog, useRoydRequests } from '@/hooks/useRoyd';
import { apiErrorMessage } from '@/utils/apiError';
import { REQUEST_STATUS_LABEL, RequestStatusBadge } from '@/components/royd/RequestStatusBadge';

const PAGE_SIZE = 15;

const StudentRequestsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Ma'muriyat nazorat rejimida: ROYD xizmat kaliti unga faqat o'qishga
    // ruxsat beradi, shuning uchun yuborish tugmasi ko'rsatilmaydi — bosilsa
    // server 403 qaytarardi va bu nosozlikka o'xshab ko'rinardi.
    const { isAdmin } = useRoleView();
    const canSubmit = !isAdmin;

    const [page, setPage] = useUrlNumberState('page', 1);
    const [status, setStatus] = useUrlState<string>('status', 'all');
    const [isFormOpen, setFormOpen] = useState(false);

    const { data, isLoading, isError, error, refetch } = useRoydRequests({
        limit: PAGE_SIZE,
        // ROYD `offset` kutadi; sahifa raqami faqat URL'da va ko'rinishda.
        offset: (page - 1) * PAGE_SIZE,
        status: status === 'all' ? undefined : status,
    });

    const statusOptions = useMemo(
        () => [
            { value: 'all', label: t('Barcha holatlar') },
            ...Object.entries(REQUEST_STATUS_LABEL).map(([value, label]) => ({
                value,
                label: t(label),
            })),
        ],
        [t],
    );

    const items = data?.items ?? [];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    // Integratsiya sozlanmagan bo'lsa bekend 503 qaytaradi — bu nosozlik
    // emas, shuning uchun matn boshqacha: talaba administratorga murojaat
    // qilishi kerak, qayta urinish yordam bermaydi.
    const isDisabled =
        (error as { response?: { status?: number } } | null)?.response?.status === 503;

    return (
        <div className="space-y-6">
            <PageHeader
                title={isAdmin ? t('Arizalar') : t('Arizalarim')}
                description={t('Registrator ofisiga yuborilgan murojaatlar va ularning holati')}
                actions={
                    !isDisabled && canSubmit && (
                        <Button onClick={() => setFormOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('Yangi ariza')}
                        </Button>
                    )
                }
            />

            {isError && (
                <ErrorState
                    title={isDisabled ? t('Arizalar tizimi ulanmagan') : t('Ma’lumotni olib bo‘lmadi')}
                    description={apiErrorMessage(error, t('Keyinroq urinib ko‘ring'))}
                    onRetry={isDisabled ? undefined : () => refetch()}
                />
            )}

            {!isError && (
                <>
                    <Card>
                        <CardContent className="p-4">
                            <div className="w-full sm:w-[220px]">
                                <Combobox
                                    options={statusOptions}
                                    value={status}
                                    onChange={(value) => {
                                        setStatus(value);
                                        setPage(1);
                                    }}
                                    placeholder={t('Holat bo‘yicha')}
                                    searchPlaceholder={t('Holat...')}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <Skeleton key={index} className="h-20 w-full" />
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <EmptyState
                            icon={<FileText className="h-10 w-10" />}
                            title={t('Ariza yo‘q')}
                            description={t('Hozircha yuborilgan murojaat yo‘q.')}
                            action={
                                canSubmit ? (
                                    <Button onClick={() => setFormOpen(true)}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        {t('Yangi ariza')}
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <div className="space-y-3">
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => navigate(`/requests/${item.id}`)}
                                    className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {item.tracking_no}
                                            </span>
                                            <RequestStatusBadge status={item.status} />
                                        </div>
                                        <p className="mt-1 truncate font-medium">{item.title}</p>
                                        {item.category?.name && (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {item.category.name}
                                            </p>
                                        )}
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {new Date(item.created_at).toLocaleDateString()}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {totalPages > 1 && (
                        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                    )}
                </>
            )}

            <NewRequestModal isOpen={isFormOpen} onClose={() => setFormOpen(false)} />
        </div>
    );
};

const NewRequestModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: catalog, isLoading: isCatalogLoading } = useRoydCatalog(isOpen);
    const createMutation = useCreateRoydRequest();

    const [typeId, setTypeId] = useState('');
    const [serviceId, setServiceId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const types = catalog ?? [];
    const services = useMemo(
        () => types.find((item) => String(item.id) === typeId)?.children ?? [],
        [types, typeId],
    );

    const reset = () => {
        setTypeId('');
        setServiceId('');
        setTitle('');
        setDescription('');
    };

    const handleSubmit = () => {
        if (!serviceId || title.trim().length < 3 || description.trim().length < 3) return;
        createMutation.mutate(
            {
                category_id: Number(serviceId),
                service_type_id: typeId ? Number(typeId) : undefined,
                title: title.trim(),
                description: description.trim(),
            },
            {
                onSuccess: (created) => {
                    toast.success(t('Ariza yuborildi: {{no}}', { no: created.tracking_no }));
                    reset();
                    onClose();
                    navigate(`/requests/${created.id}`);
                },
                onError: (mutationError) =>
                    toast.error(apiErrorMessage(mutationError, t('Arizani yuborib bo‘lmadi'))),
            },
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('Yangi ariza')}>
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Xizmat turi')}</label>
                    <Combobox
                        options={types.map((item) => ({ value: String(item.id), label: item.name }))}
                        value={typeId}
                        onChange={(value) => {
                            setTypeId(value);
                            // Tur o'zgarsa xizmat ham tozalanadi: aks holda
                            // boshqa turdagi xizmat tanlangan holda qolardi va
                            // server mos kelmaslik uchun rad etardi.
                            setServiceId('');
                        }}
                        placeholder={isCatalogLoading ? t('Yuklanmoqda...') : t('Turni tanlang')}
                        searchPlaceholder={t('Qidirish...')}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Xizmat')}</label>
                    <Combobox
                        options={services.map((item) => ({ value: String(item.id), label: item.name }))}
                        value={serviceId}
                        onChange={setServiceId}
                        placeholder={typeId ? t('Xizmatni tanlang') : t('Avval turni tanlang')}
                        searchPlaceholder={t('Qidirish...')}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Mavzu')}</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Tavsif')}</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={5}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <p className="text-xs text-muted-foreground">
                    {t('Arizani kim ko‘rib chiqishini tizim fakultetingiz bo‘yicha o‘zi aniqlaydi.')}
                </p>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                        {t('Bekor qilish')}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        isLoading={createMutation.isPending}
                        disabled={!serviceId || title.trim().length < 3 || description.trim().length < 3}
                    >
                        {t('Yuborish')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default StudentRequestsPage;
