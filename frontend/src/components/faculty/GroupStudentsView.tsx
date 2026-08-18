import { useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, ChevronRight, FolderEdit, Search } from 'lucide-react';
import { useStudents } from '@/hooks/useStudents';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import type { Faculty } from '@/services/facultyService';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import { Crumbs } from './Crumbs';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

interface GroupStudentsViewProps {
    faculty: Faculty;
    group: Group;
    onBackToFaculties: () => void;
    onBackToGroups: () => void;
    onOpenStudent: (student: Student) => void;
}

export const GroupStudentsView = ({
    faculty,
    group,
    onBackToFaculties,
    onBackToGroups,
    onOpenStudent,
}: GroupStudentsViewProps) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [studentToMove, setStudentToMove] = useState<Student | null>(null);
    const pageSize = 10;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: studentsData, isLoading, isError, refetch } = useStudents(currentPage, pageSize, debouncedSearch, undefined, group.id);
    const students = studentsData?.students || [];
    const totalPages = studentsData ? Math.ceil(studentsData.total / pageSize) : 1;

    const columns: DataTableColumn<Student>[] = [
        { key: 'id', header: 'ID', headClassName: 'w-[80px]', cell: (student) => student.id },
        { key: 'full_name', header: 'F.I.SH', className: 'font-medium', cell: (student) => student.full_name || '-' },
        { key: 'student_id_number', header: 'Talaba raqami', hideBelow: 'lg', cell: (student) => student.student_id_number || '-' },
        { key: 'phone', header: 'Telefon', hideBelow: 'lg', cell: (student) => student.phone || '-' },
        {
            key: 'actions',
            header: '',
            headClassName: 'w-[40px]',
            className: 'text-right',
            cell: (student) => (
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        title="Guruhni o'zgartirish"
                        onClick={(e) => { e.stopPropagation(); setStudentToMove(student); }}
                    >
                        <FolderEdit className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                    <Crumbs items={[
                        { label: 'Fakultetlar', onClick: onBackToFaculties },
                        { label: faculty.name, onClick: onBackToGroups },
                        { label: group.name },
                    ]} />
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={onBackToGroups}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Orqaga
                        </Button>
                        <h1 className="page-title">{group.name} — talabalar</h1>
                    </div>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Qidirish..."
                        className="pl-8 w-[220px]"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={students}
                        rowKey={(student) => student.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        emptyTitle="Talabalar topilmadi"
                        emptyDescription="Ushbu guruhda talaba yo'q yoki qidiruvga mos talaba topilmadi."
                        onRowClick={onOpenStudent}
                        renderCard={(student) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground">{student.full_name || '-'}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {student.student_id_number || '-'} · {student.phone || '-'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            title="Guruhni o'zgartirish"
                                            onClick={(e) => { e.stopPropagation(); setStudentToMove(student); }}
                                        >
                                            <FolderEdit className="h-4 w-4" />
                                        </Button>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                            </div>
                        )}
                    />
                </CardContent>
            </Card>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isLoading}
            />

            <ChangeGroupModal
                isOpen={!!studentToMove}
                onClose={() => setStudentToMove(null)}
                student={studentToMove}
            />
        </div>
    );
};
