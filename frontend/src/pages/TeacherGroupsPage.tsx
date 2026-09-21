import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useGroups } from '@/hooks/useGroups';
import { useFaculties } from '@/hooks/useReferenceData';
import type { Group } from '@/services/groupService';
import { educationShapeKey } from '@/utils/education';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Users, ArrowRight, BookOpen } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

const TeacherGroupsPage = () => {
    const { t } = useTranslation();
    const { user, hasPermission } = useAuth();
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);

    // Assuming user.id is the teacher's ID
    const teacherId = user?.id;

    // Use existing useGroups hook but we need to ensure it supports teacher_id param
    // We might need to update the hook or service if it doesn't support generic params
    const { data, isLoading, isError, refetch } = useGroups(currentPage, pageSize, '', teacherId);

    const groups = data?.groups || [];
    const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

    // Guruh javobida faqat `faculty_id` bor — nom ma'lumotnomadan olinadi.
    // Ilgari kartochkada ichki identifikatorlar turardi («Fakultet ID: 2»):
    // ular o'qituvchiga hech narsa anglatmaydi va guruhni ajratishga yordam
    // bermaydi.
    const { data: facultiesData } = useFaculties(1, 200, undefined, hasPermission('read:faculty'));
    const faculties = facultiesData?.faculties || [];
    const getFacultyName = (facultyId: number) =>
        faculties.find((faculty) => faculty.id === facultyId)?.name ?? '—';

    /** Kurs va ta'lim shakli: «2-kurs · kunduzgi». Bo'shlari tushib qoladi. */
    const groupSubtitle = (group: Group) =>
        [
            group.course ? t('{{n}}-kurs', { n: group.course }) : null,
            educationShapeKey(group.education_shape),
        ]
            .filter(Boolean)
            .map((part) => t(part as string))
            .join(' · ');

    return (
        <div className="space-y-6">
            <PageHeader
                title="Mening guruhlarim"
                description="Sizga biriktirilgan guruhlar ro'yxati. Guruh tanlab, natijalarni ko'rishingiz mumkin."
            />

            {isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-44 w-full rounded-xl" />
                    ))}
                </div>
            ) : isError ? (
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState onRetry={() => refetch()} />
                    </CardContent>
                </Card>
            ) : groups.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="pt-6">
                        <EmptyState
                            icon={<Users className="h-6 w-6" />}
                            title="Guruhlar biriktirilmagan"
                            description="Hozircha sizga hech qanday guruh biriktirilmagan. Admin bilan bog'laning."
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {groups.map((group) => (
                        <Card
                            key={group.id}
                            className="group cursor-pointer transition-all hover:border-primary/40 hover:shadow-md"
                            onClick={() => navigate(`/results?group_id=${group.id}`)}
                        >
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center justify-between text-base">
                                    <span className="truncate">{group.name}</span>
                                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                                </CardTitle>
                                <CardDescription>{groupSubtitle(group) || '—'}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Users className="h-4 w-4" />
                                        <span>Talabalar natijalari</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <BookOpen className="h-4 w-4" />
                                        <span className="truncate">{getFacultyName(group.faculty_id)}</span>
                                    </div>
                                </div>
                                <Button
                                    className="w-full mt-4"
                                    variant="secondary"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/results?group_id=${group.id}`);
                                    }}
                                >
                                    Natijalarni ko'rish
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isLoading}
                totalItems={data?.total ?? 0}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
            />
        </div>
    );
};

export default TeacherGroupsPage;
