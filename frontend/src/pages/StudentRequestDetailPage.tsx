import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Paperclip, RotateCcw, Send } from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
    useAddRoydMessage,
    useResubmitRoydRequest,
    useRoydRequest,
    useUploadRoydFile,
} from '@/hooks/useRoyd';
import { useAuth } from '@/context/AuthContext';
import { apiErrorMessage } from '@/utils/apiError';
import { formatSize } from '@/utils/fileSize';
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
    const messageMutation = useAddRoydMessage(id ?? 0);
    const fileMutation = useUploadRoydFile(id ?? 0);

    // Yozish huquqi talaba yozuviga bog'liq, rolga emas — bekend ham
    // shunday tekshiradi (`students.student_id_number`).
    const { user } = useAuth();
    const canWrite = Boolean(user?.student);
    // DIQQAT: `student.student_id_number` ga qaramaymiz — `/user/me`
    // uni qaytarmaydi (`StudentDetailResponse` da bunday maydon yo'q),
    // garchi TS tipida e'lon qilingan bo'lsa ham. Talaba yozuvining
    // BORLIGI yetarli: bekend ham shu yozuv bo'yicha ishlaydi.

    const [draft, setDraft] = useState('');
    const [resubmitComment, setResubmitComment] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const resubmitMutation = useResubmitRoydRequest(id ?? 0);

    const sendMessage = () => {
        const content = draft.trim();
        if (!content) return;
        messageMutation.mutate(content, {
            onSuccess: () => setDraft(''),
            onError: (mutationError) =>
                toast.error(apiErrorMessage(mutationError, t('Xabarni yuborib bo‘lmadi'))),
        });
    };

    const uploadFile = (file: File | undefined) => {
        if (!file) return;
        fileMutation.mutate(file, {
            onSuccess: () => toast.success(t('Fayl yuklandi')),
            onError: (mutationError) =>
                toast.error(apiErrorMessage(mutationError, t('Faylni yuklab bo‘lmadi'))),
        });
    };

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

            <Card>
                <CardContent className="space-y-3 p-4">
                    <h2 className="text-sm font-semibold">{t('Fayllar')}</h2>
                    {(data.files ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('Fayl biriktirilmagan')}</p>
                    ) : (
                        <ul className="space-y-1 text-sm">
                            {(data.files ?? []).map((file) => (
                                <li key={file.id} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{file.file_name}</span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatSize(file.file_size)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {canWrite && (
                        <Button
                            variant="outline"
                            size="sm"
                            isLoading={fileMutation.isPending}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Paperclip className="mr-2 h-4 w-4" />
                            {t('Fayl biriktirish')}
                        </Button>
                    )}
                    {/* Nativ input yashirin: brauzer tilidagi «Choose File»
                        tarjima qilinmaydi va qolgan tugmalardan farq qiladi. */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            uploadFile(e.target.files?.[0]);
                            e.target.value = '';
                        }}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-3 p-4">
                    <h2 className="text-sm font-semibold">{t('Yozishmalar')}</h2>
                    {(data.messages ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('Hozircha xabar yo‘q')}</p>
                    ) : (
                        <ul className="space-y-3">
                            {(data.messages ?? []).map((message) => (
                                <li key={message.id} className="rounded-lg border border-border p-3">
                                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                        {/* O'z xabarini «Xodim» deb ko'rsatish chalkash edi:
                                            ROYD rolni `sender_role` da beradi. */}
                                        <span>
                                            {message.sender_role === 'student'
                                                ? t('Siz')
                                                : message.sender_name || t('Xodim')}
                                        </span>
                                        <span>{new Date(message.created_at).toLocaleString()}</span>
                                    </div>
                                    <p className="mt-1 whitespace-pre-line text-sm">{message.content}</p>
                                </li>
                            ))}
                        </ul>
                    )}

                    {canWrite && <div className="flex gap-2">
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={2}
                            placeholder={t('Xabar yozish...')}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                        <Button
                            onClick={sendMessage}
                            isLoading={messageMutation.isPending}
                            disabled={!draft.trim()}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>}
                </CardContent>
            </Card>
        </div>
    );
};

export default StudentRequestDetailPage;
