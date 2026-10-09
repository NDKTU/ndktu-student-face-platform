import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ClipboardList, ScanFace, UsersRound, Video } from 'lucide-react';
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
import { formatDate, formatTime } from '@/utils/date';

type Tab = 'meeting' | 'report';

/**
 * Bitta seans: talabaga — uchrashuv (vaqti kelganda), yaratuvchi va adminga
 * yana «Hisobot» — kim kirdi, yuz nazorati natijalari.
 */
export default function ZoomSessionDetailPage() {
    const sessionId = Number(useParams().sessionId);
    const { hasPermission } = useAuth();
    const { data: session, isLoading, isError, refetch } = useZoomSession(sessionId);
    const [tab, setTab] = useState<Tab>('meeting');

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

    return (
        <div className="space-y-6">
            <Link to="/zoom" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-4 w-4" /> Seanslar
            </Link>
            <PageHeader title={session.title} actions={<SessionStatusBadge session={session} />} />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4" />
                    {formatDate(session.starts_at)}, {formatTime(session.starts_at)}–{formatTime(session.ends_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <UsersRound className="h-4 w-4" />
                    {session.groups.map((g) => g.name).join(', ')}
                </span>
                {session.face_check_enabled && (
                    <span className="inline-flex items-center gap-1.5">
                        <ScanFace className="h-4 w-4" /> Yuz nazorati
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
            ) : (
                <ZoomMeetingBox sessionId={session.id} faceCheckEnabled={studentView && session.face_check_enabled} />
            )}
        </div>
    );
}
