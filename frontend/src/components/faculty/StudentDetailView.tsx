import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { CheckCircle2, FolderEdit, XCircle, ArrowRight } from 'lucide-react';
import { useUserResults } from '@/hooks/useResults';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import type { Faculty } from '@/services/facultyService';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import type { Result } from '@/services/resultService';
import { OrganizationBreadcrumbs } from './OrganizationBreadcrumbs';
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
    <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-border/50 last:border-0">
        <span className="text-xs font-semibold text-muted-foreground">{label}:</span>
        <span className="text-xs font-medium text-foreground truncate">{value || '—'}</span>
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
    const {
        data: resultsData,
        isLoading: isResultsLoading,
        isError: isResultsError,
        refetch,
    } = useUserResults(student.user_id, resultsPage, resultsPageSize);

    const results: Result[] = resultsData?.results || [];
    const resultsTotalPages = resultsData ? Math.ceil(resultsData.total / resultsPageSize) : 1;

    const renderResultScore = (r: Result) => (
        <div className="flex flex-col gap-1">
            <span className="text-base font-bold font-mono">
                {r.grade.toFixed(1)}
                <span className="text-xs font-normal text-muted-foreground"> / 5</span>
            </span>
            <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-0.5 text-success font-medium">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{r.correct_answers}</span>
                </div>
                <div className="flex items-center gap-0.5 text-destructive font-medium">
                    <XCircle className="h-3 w-3" />
                    <span>{r.wrong_answers}</span>
                </div>
            </div>
        </div>
    );

    const resultColumns: DataTableColumn<Result>[] = [
        {
            key: 'quiz',
            header: 'Test Nomi',
            className: 'font-semibold align-middle capitalize text-foreground',
            cell: (r) => r.quiz?.title || '-',
        },
        {
            key: 'subject',
            header: 'Fan',
            className: 'align-middle capitalize text-xs',
            cell: (r) => r.subject?.name || '-',
        },
        {
            key: 'created_at',
            header: 'Sana',
            hideBelow: 'lg',
            className: 'align-middle text-xs font-mono text-muted-foreground',
            cell: (r) => new Date(r.created_at).toLocaleDateString(),
        },
        { key: 'grade', header: 'Natija', className: 'align-middle', cell: renderResultScore },
        {
            key: 'details',
            header: 'Batafsil',
            headClassName: 'text-right pr-4',
            className: 'text-right pr-4',
            cell: (r) => (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 gap-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/results/answers?user_id=${student.user_id}&quiz_id=${r.quiz_id}`);
                    }}
                >
                    <span>Javoblar</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            {/* Dynamic Unified Breadcrumbs */}
            <OrganizationBreadcrumbs
                items={[
                    { label: 'Fakultetlar', onClick: onBackToFaculties },
                    { label: faculty.name, onClick: onBackToGroups },
                    { label: group.name, onClick: onBackToStudents },
                    { label: student.full_name || `Talaba #${student.id}` },
                ]}
                onBack={onBackToStudents}
                title={student.full_name || `Talaba #${student.id}`}
                description={`${faculty.name} · ${group.name} · Talaba shaxsiy va akademik profili`}
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 font-semibold shadow-sm"
                        onClick={() => setMoveOpen(true)}
                    >
                        <FolderEdit className="h-4 w-4" />
                        <span>Boshqa guruhga o'tkazish</span>
                    </Button>
                }
            />

            <div className="grid gap-5 md:grid-cols-2">
                <Card className="border border-border/80 shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/60">
                        <CardTitle className="text-base font-bold">Shaxsiy ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-1">
                        <InfoRow label="F.I.SH" value={student.full_name} />
                        <InfoRow
                            label="Talaba raqami"
                            value={
                                student.student_id_number ? (
                                    <span className="font-mono">{student.student_id_number}</span>
                                ) : null
                            }
                        />
                        <InfoRow
                            label="Telefon"
                            value={student.phone ? <span className="font-mono">{student.phone}</span> : null}
                        />
                        <InfoRow label="Manzil" value={student.address} />
                        <InfoRow label="Tug'ilgan sana" value={student.birth_date} />
                        <InfoRow label="Jinsi" value={student.gender} />
                        <InfoRow label="User ID" value={<span className="font-mono">{student.user_id}</span>} />
                    </CardContent>
                </Card>

                <Card className="border border-border/80 shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/60">
                        <CardTitle className="text-base font-bold">Akademik ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-1">
                        <InfoRow label="Fakultet" value={student.faculty} />
                        <InfoRow label="Mutaxassislik" value={student.specialty} />
                        <InfoRow label="Bosqich" value={student.level ? `${student.level}-kurs` : null} />
                        <InfoRow label="Semestr" value={student.semester ? `${student.semester}-semestr` : null} />
                        <InfoRow label="Ta'lim shakli" value={student.education_form} />
                        <InfoRow label="Ta'lim turi" value={student.education_type} />
                        <InfoRow label="To'lov shakli" value={student.payment_form} />
                        <InfoRow label="Ta'lim tili" value={student.education_lang} />
                        <InfoRow label="Status" value={student.student_status} />
                        <InfoRow
                            label="O'rtacha ball (GPA)"
                            value={
                                student.avg_gpa !== null && student.avg_gpa !== undefined ? (
                                    <span className="font-mono font-bold text-primary">{student.avg_gpa}</span>
                                ) : null
                            }
                        />
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-border/80 shadow-sm">
                <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-base font-bold">Sinov va Test Natijalari</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <DataTable
                        columns={resultColumns}
                        data={results}
                        rowKey={(r) => r.id}
                        onRowClick={(r) =>
                            navigate(`/results/answers?user_id=${student.user_id}&quiz_id=${r.quiz_id}`)
                        }
                        isLoading={isResultsLoading}
                        isError={isResultsError}
                        onRetry={() => refetch()}
                        emptyTitle="Natijalar topilmadi"
                        emptyDescription="Ushbu talaba hali hech qanday test topshirmagan."
                    />
                    {results.length > 0 && resultsTotalPages > 1 && (
                        <div className="p-4 border-t border-border/60">
                            <Pagination
                                currentPage={resultsPage}
                                totalPages={resultsTotalPages}
                                onPageChange={setResultsPage}
                                isLoading={isResultsLoading}
                            />
                        </div>
                    )}
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
