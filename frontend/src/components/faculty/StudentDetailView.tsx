import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ArrowLeft, CheckCircle2, FolderEdit, XCircle } from 'lucide-react';
import { useUserResults } from '@/hooks/useResults';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import type { Faculty } from '@/services/facultyService';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import type { Result } from '@/services/resultService';
import { Crumbs } from './Crumbs';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

interface StudentDetailViewProps {
    faculty: Faculty;
    group: Group;
    student: Student;
    onBackToFaculties: () => void;
    onBackToGroups: () => void;
    onBackToStudents: () => void;
}

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-2 gap-2">
        <span className="font-semibold text-muted-foreground">{label}:</span>
        <span>{value || '-'}</span>
    </div>
);

export const StudentDetailView = ({
    faculty,
    group,
    student,
    onBackToFaculties,
    onBackToGroups,
    onBackToStudents,
}: StudentDetailViewProps) => {
    const navigate = useNavigate();
    const [moveOpen, setMoveOpen] = useState(false);
    const [resultsPage, setResultsPage] = useState(1);
    const resultsPageSize = 5;
    const { data: resultsData, isLoading: isResultsLoading, isError: isResultsError, refetch } =
        useUserResults(student.user_id, resultsPage, resultsPageSize);

    const results: Result[] = resultsData?.results || [];
    const resultsTotalPages = resultsData ? Math.ceil(resultsData.total / resultsPageSize) : 1;

    const renderResultScore = (r: Result) => (
        <div className="flex flex-col gap-1">
            <span className="text-lg font-bold">
                {r.grade.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground"> / 5</span>
            </span>
            <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{r.correct_answers}</span>
                </div>
                <div className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{r.wrong_answers}</span>
                </div>
            </div>
        </div>
    );

    const resultColumns: DataTableColumn<Result>[] = [
        {
            key: 'quiz',
            header: 'Test Nomi',
            className: 'font-medium align-middle capitalize',
            cell: (r) => r.quiz?.title || '-',
        },
        { key: 'subject', header: 'Fan', className: 'align-middle capitalize', cell: (r) => r.subject?.name || '-' },
        {
            key: 'created_at',
            header: 'Sana',
            hideBelow: 'lg',
            className: 'align-middle',
            cell: (r) => new Date(r.created_at).toLocaleDateString(),
        },
        { key: 'grade', header: 'Natija', className: 'align-middle', cell: renderResultScore },
        {
            key: 'details',
            header: 'Batafsil',
            headClassName: 'text-right',
            className: 'text-right',
            cell: (r) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(
                        `/results/answers?user_id=${student.user_id}&quiz_id=${r.quiz_id}`
                    )}
                >
                    Javoblarni ko'rish
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Crumbs items={[
                    { label: 'Fakultetlar', onClick: onBackToFaculties },
                    { label: faculty.name, onClick: onBackToGroups },
                    { label: group.name, onClick: onBackToStudents },
                    { label: student.full_name || `Talaba #${student.id}` },
                ]} />
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={onBackToStudents}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Orqaga
                    </Button>
                    <h1 className="page-title">
                        {student.full_name || `Talaba #${student.id}`}
                    </h1>
                    <Button variant="outline" size="sm" className="ml-auto" onClick={() => setMoveOpen(true)}>
                        <FolderEdit className="h-4 w-4 mr-2" />
                        Boshqa guruhga o'tkazish
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Shaxsiy ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <InfoRow label="F.I.SH" value={student.full_name} />
                        <InfoRow label="Talaba raqami" value={student.student_id_number} />
                        <InfoRow label="Telefon" value={student.phone} />
                        <InfoRow label="Manzil" value={student.address} />
                        <InfoRow label="Tug'ilgan sana" value={student.birth_date} />
                        <InfoRow label="Jinsi" value={student.gender} />
                        <InfoRow label="User ID" value={student.user_id} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Akademik ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <InfoRow label="Fakultet" value={student.faculty} />
                        <InfoRow label="Mutaxassislik" value={student.specialty} />
                        <InfoRow label="Bosqich" value={student.level} />
                        <InfoRow label="Semestr" value={student.semester} />
                        <InfoRow label="Ta'lim shakli" value={student.education_form} />
                        <InfoRow label="Ta'lim turi" value={student.education_type} />
                        <InfoRow label="To'lov shakli" value={student.payment_form} />
                        <InfoRow label="Ta'lim tili" value={student.education_lang} />
                        <InfoRow label="Status" value={student.student_status} />
                        <InfoRow label="O'rtacha ball (GPA)" value={student.avg_gpa ?? '-'} />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Natijalar</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <DataTable
                            columns={resultColumns}
                            data={results}
                            rowKey={(r) => r.id}
                            isLoading={isResultsLoading}
                            isError={isResultsError}
                            onRetry={() => refetch()}
                            emptyTitle="Natijalar topilmadi"
                            emptyDescription="Ushbu talaba uchun natijalar topilmadi."
                            renderCard={(r) => (
                                <div className="rounded-xl border border-border bg-card p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-medium capitalize text-foreground">{r.quiz?.title || '-'}</p>
                                            <p className="mt-1 text-xs text-muted-foreground capitalize">
                                                {r.subject?.name || '-'} · {new Date(r.created_at).toLocaleDateString()}
                                            </p>
                                            <div className="mt-2">{renderResultScore(r)}</div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => navigate(
                                                `/results/answers?user_id=${student.user_id}&quiz_id=${r.quiz_id}`
                                            )}
                                        >
                                            Javoblarni ko'rish
                                        </Button>
                                    </div>
                                </div>
                            )}
                        />
                        {results.length > 0 && resultsTotalPages > 1 && (
                            <Pagination
                                currentPage={resultsPage}
                                totalPages={resultsTotalPages}
                                onPageChange={setResultsPage}
                                isLoading={isResultsLoading}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>

            <ChangeGroupModal
                isOpen={moveOpen}
                onClose={() => setMoveOpen(false)}
                student={student}
                onSuccess={onBackToStudents}
            />
        </div>
    );
};
