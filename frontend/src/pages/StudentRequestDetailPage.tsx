import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, RotateCcw } from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useResubmitRoydRequest, useRoydRequest } from '@/hooks/useRoyd';
import { useAuth } from '@/context/AuthContext';
import { apiErrorMessage } from '@/utils/apiError';
import {
    REQUEST_STATUS_LABEL,
    RequestStatusBadge,
} from '@/components/royd/RequestStatusBadge';
import type { RequestStatus } from '@/services/roydService';

/**
 * Talaba ko'radigan yo'l. `returned` va `rejected` bu qatorda yo'q: ular
 * chiziqdan chetga chiqish, bosqich emas — ROYD frontendida ham shunday.
 */
const PROGRESS: RequestStatus[] = ['new', 'accepted', 'in_progress', 'completed'];

const StudentRequestDetailPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { requestId } = useParams<{ requestId: string }>();
    const id = requestId ? Number(requestId) : undefined;

    const { data, isLoading, isError, error, refetch } = useRoydRequest(id);

    // Yozish huquqi talaba yozuviga bog'liq, rolga emas — bekend ham
    // shunday tekshiradi (`students.student_id_number`).
    const { user } = useAuth();
    const canWrite = Boolean(user?.student);
    // DIQQAT: `student.student_id_number` ga qaramaymiz — `/user/me`
    // uni qaytarmaydi (`StudentDetailResponse` da bunday maydon yo'q),
    // garchi TS tipida e'lon qilingan bo'lsa ham. Talaba yozuvining
    // BORLIGI yetarli: bekend ham shu yozuv bo'yicha ishlaydi.

    const [resubmitComment, setResubmitComment] = useState('');
    const resubmitMutation = useResubmitRoydRequest(id ?? 0);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    }

    if (isError || !data) {
        return (
            <ErrorState
                title={t('Arizani olib bo‘lmadi')}
                description={apiErrorMessage(error, t('Keyinroq urinib ko‘ring'))}
                onRetry={() => refetch()}
            />
        );
    }

    const currentStep = PROGRESS.indexOf(data.status);
    const isOffPath = currentStep === -1;

    return (
        <div className="space-y-6">
            <PageHeader
                title={data.title}
                description={data.tracking_no}
                actions={
                    <Button variant="outline" onClick={() => navigate('/requests')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {t('Orqaga')}
                    </Button>
                }
            />

            <Card>
                <CardContent className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <RequestStatusBadge status={data.status} />
                        {data.category?.name && (
                            <span className="text-sm text-muted-foreground">{data.category.name}</span>
                        )}
                    </div>

                    {/* Chiziqdan chetga chiqqan holat (rad etildi/qaytarildi)
                        bosqich sifatida ko'rsatilmaydi — u yo'lning davomi
                        emas, boshqa natija. */}
                    {!isOffPath && (
                        <ol className="flex flex-wrap gap-2">
                            {PROGRESS.map((step, index) => (
                                <li
                                    key={step}
                                    className={
                                        index <= currentStep
                                            ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary'
                                            : 'rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground'
                                    }
                                >
                                    {t(REQUEST_STATUS_LABEL[step])}
                                </li>
                            ))}
                        </ol>
                    )}

                    <p className="whitespace-pre-line text-sm">{data.description}</p>
                </CardContent>
            </Card>

            {/* «Qaytarildi» — ish talabada: xodim qo'shimcha ma'lumot
                so'ragan va SLA to'xtatilgan. Qayta yuborish tugmasi bo'lmasa,
                murojaat muddatsiz turib qolardi. */}
            {data.status === 'returned' && canWrite && (
                <Card>
                    <CardContent className="space-y-3 p-4">
                        <h2 className="text-sm font-semibold">{t('Arizani qayta yuborish')}</h2>
                        <p className="text-xs text-muted-foreground">
                            {t('Xodim qo\u2018shimcha ma\u2019lumot so\u2018ragan. To\u2018ldirib qayta yuboring.')}
                        </p>
                        <textarea
                            value={resubmitComment}
                            onChange={(e) => setResubmitComment(e.target.value)}
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                        <Button
                            isLoading={resubmitMutation.isPending}
                            disabled={!resubmitComment.trim()}
                            onClick={() =>
                                resubmitMutation.mutate(resubmitComment.trim(), {
                                    onSuccess: () => {
                                        setResubmitComment('');
                                        toast.success(t('Ariza qayta yuborildi'));
                                    },
                                    onError: (mutationError) =>
                                        toast.error(
                                            apiErrorMessage(mutationError, t('Qayta yuborib bo\u2018lmadi')),
                                        ),
                                })
                            }
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t('Qayta yuborish')}
                        </Button>
                    </CardContent>
                </Card>
            )}

        </div>
    );
};

export default StudentRequestDetailPage;
