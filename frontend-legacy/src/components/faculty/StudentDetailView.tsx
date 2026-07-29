import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table';
import { ArrowLeft, CheckCircle2, FolderEdit, Loader2, XCircle } from 'lucide-react';
import { useUserResults } from '@/hooks/useResults';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import type { Faculty } from '@/services/facultyService';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import { Crumbs } from './Crumbs';

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
    const { data: resultsData, isLoading: isResultsLoading } =
        useUserResults(student.user_id, resultsPage, resultsPageSize);

    const results = resultsData?.results || [];
    const resultsTotalPages = resultsData ? Math.ceil(resultsData.total / resultsPageSize) : 1;

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
                    <h1 className="text-xl font-semibold tracking-tight">
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
                    {isResultsLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Test Nomi</TableHead>
                                        <TableHead>Fan</TableHead>
                                        <TableHead>Sana</TableHead>
                                        <TableHead>Natija</TableHead>
                                        <TableHead className="text-right">Batafsil</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="font-medium align-middle capitalize">
                                                {r.quiz?.title || '-'}
                                            </TableCell>
                                            <TableCell className="align-middle capitalize">
                                                {r.subject?.name || '-'}
                                            </TableCell>
                                            <TableCell className="align-middle">
                                                {new Date(r.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="align-middle">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-lg font-bold">
                                                        {r.grade.toFixed(1)}
                                                        <span className="text-sm font-normal text-muted-foreground"> / 5</span>
                                                    </span>
                                                    <div className="flex items-center gap-3 text-xs">
                                                        <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            <span>{r.correct_answers}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-red-600 dark:text-red-500">
                                                            <XCircle className="h-3.5 w-3.5" />
                                                            <span>{r.wrong_answers}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(
                                                        `/results/answers?user_id=${student.user_id}&quiz_id=${r.quiz_id}`
                                                    )}
                                                >
                                                    Javoblarni ko'rish
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {results.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                                Ushbu talaba uchun natijalar topilmadi.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            {results.length > 0 && resultsTotalPages > 1 && (
                                <Pagination
                                    currentPage={resultsPage}
                                    totalPages={resultsTotalPages}
                                    onPageChange={setResultsPage}
                                    isLoading={isResultsLoading}
                                />
                            )}
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
