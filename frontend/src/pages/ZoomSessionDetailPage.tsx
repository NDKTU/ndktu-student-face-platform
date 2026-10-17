import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, CalendarClock, ClipboardList, ExternalLink, GraduationCap, ScanFace, UsersRound, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabBar, type TabDef } from '@/components/ui/TabBar';
import { SessionStatusBadge } from '@/components/zoom/SessionStatusBadge';
import { ZoomFaceCheckReport } from '@/components/zoom/ZoomFaceCheckReport';
import { ZoomMeetingBox } from '@/components/zoom/ZoomMeetingBox';
import { useAuth } from '@/context/AuthContext';
import { useZoomSession } from '@/hooks/useZoomSessions';
import { zoomSessionService } from '@/services/zoomSessionService';
import { apiErrorMessage } from '@/utils/apiError';
import { formatDate, formatTime } from '@/utils/date';

type Tab = 'meeting' | 'report';

/**
 * Bitta seans: talabaga — uchrashuv (vaqti kelganda), yaratuvchi va adminga
 * yana «Hisobot» — kim kirdi, yuz nazorati natijalari.
 */
export default function ZoomSessionDetailPage() {
    const sessionId = Number(useParams().sessionId);
    const { hasPermission, user } = useAuth();
    const { data: session, isLoading, isError, refetch } = useZoomSession(sessionId);
    const [tab, setTab] = useState<Tab>('meeting');
    const [starting, setStarting] = useState(false);

    if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
    if (isError || !session) {
        return (
            <div className="space-y-4">
                <ErrorState onRetry={() => refetch()} />
                <Link to="/zoom" className="text-sm text-primary underline">
                    Seanslar ro'yxatiga qaytish
                </Link>
            </div>
        );
    }

    const canReport = session.can_manage && hasPermission('read:zoom_report');
    const tabs: TabDef<Tab>[] = [
        { id: 'meeting', label: 'Dars', icon: <Video className="h-4 w-4" /> },
        ...(canReport ? [{ id: 'report' as const, label: 'Hisobot', icon: <ClipboardList className="h-4 w-4" /> }] : []),
    ];
    // Yaratuvchi va admin darsni olib boradi: ular uchun yuz tekshiruvi yo'q,
    // server ham ularga vaqt va guruh shartini qo'ymaydi.
    const studentView = !session.can_manage;
    // Host — darsning o'qituvchisi (server ham shunday hal qiladi:
    // `repository.py::_is_host`); admin kuzatuvchi bo'lib kiradi.
    const isHost = session.zoom_managed && (session.teacher_user_id ? user?.id === session.teacher_user_id : session.can_manage);

    // Host havolasi har safar yangidan olinadi: ichidagi ZAK ~2 soatda eskiradi.
    // Oyna avval ochiladi — `await` dan keyin brauzer popup'ni bloklardi.
    const startAsHost = async () => {
        const popup = window.open('', '_blank');
        setStarting(true);
        try {
            const { start_url } = await zoomSessionService.start(session.id);
            if (popup) popup.location.href = start_url;
            else window.location.href = start_url;
        } catch (cause) {
            popup?.close();
            toast.error(apiErrorMessage(cause, "Uchrashuvni boshlab bo'lmadi"));
        } finally {
            setStarting(false);
        }
    };

    return (
        <div className="space-y-6">
            <Link to="/zoom" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-4 w-4" /> Seanslar
            </Link>
            <PageHeader
                title={session.title}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <SessionStatusBadge session={session} />
                        {session.can_manage && session.zoom_managed && (
                            <Button size="sm" isLoading={starting} onClick={() => void startAsHost()}>
                                <ExternalLink className="h-4 w-4" /> Zoom ilovasida boshlash
                            </Button>
                        )}
                    </div>
                }
            />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4" />
                    {formatDate(session.starts_at)}, {formatTime(session.starts_at)}–{formatTime(session.ends_at)}
                </span>
                {session.subject_name && (
                    <span className="inline-flex items-center gap-1.5">
                        <BookOpen className="h-4 w-4" /> {session.subject_name}
                    </span>
                )}
                {session.teacher_name && (
                    <span className="inline-flex items-center gap-1.5">
                        <GraduationCap className="h-4 w-4" /> {session.teacher_name}
                    </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                    <UsersRound className="h-4 w-4" />
                    {session.groups.map((g) => g.name).join(', ')}
                </span>
                {session.face_check_enabled && (
                    <span className="inline-flex items-center gap-1.5">
                        <ScanFace className="h-4 w-4" /> {session.random_face_checks ? 'Yuz nazorati' : 'Yuz nazorati: faqat kirishda'}
                    </span>
                )}
                {session.zoom_account_name && (
                    <span className="inline-flex items-center gap-1.5">
                        <Video className="h-4 w-4" /> {session.zoom_account_name}
                    </span>
                )}
            </div>

            {tabs.length > 1 && <TabBar tabs={tabs} active={tab} onChange={setTab} />}

            {tab === 'report' && canReport ? (
                <Card>
                    <CardContent className="pt-6">
                        <ZoomFaceCheckReport sessionId={session.id} />
                    </CardContent>
                </Card>
            ) : studentView && session.status === 'upcoming' ? (
                <Card>
                    <EmptyState
                        icon={<CalendarClock className="h-6 w-6" />}
                        title={`Seans ${formatTime(session.opens_at)} da ochiladi`}
                        description={`Dars ${formatTime(session.starts_at)} da boshlanadi. Kirish 10 daqiqa oldin ochiladi — sahifa o'zi yangilanadi.`}
                    />
                </Card>
            ) : studentView && session.status === 'closed' ? (
                <Card>
                    <EmptyState
                        icon={<Video className="h-6 w-6" />}
                        title="Seans tugagan"
                        description="Seans vaqti o'tgandan keyin unga kirib bo'lmaydi."
                    />
                </Card>
            ) : session.can_manage && !session.zoom_managed ? (
                /* Qo'lda berilgan havola: uchrashuv o'qituvchining o'z Zoom'ida,
                   LMS uning ZAK'ini ololmaydi. Sahifadagi SDK bilan u faqat
                   ishtirokchi bo'lardi — ovozsiz va host huquqisiz. */
                <Card>
                    <EmptyState
                        icon={<Video className="h-6 w-6" />}
                        title="Darsni host sifatida boshlang"
                        description="Uchrashuvni o'z Zoom akkauntingizda boshlang — havola egasi host bo'ladi."
                        action={
                            session.link_url ? (
                                <Button onClick={() => window.open(session.link_url ?? '', '_blank', 'noopener,noreferrer')}>
                                    <ExternalLink className="h-4 w-4" /> Zoom'da ochish
                                </Button>
                            ) : undefined
                        }
                    />
                </Card>
            ) : (
                <ZoomMeetingBox
                    sessionId={session.id}
                    host={isHost}
                    faceCheckEnabled={studentView && session.face_check_enabled}
                    randomChecks={session.random_face_checks}
                    appFallback={session.zoom_managed}
                />
            )}
        </div>
    );
}
