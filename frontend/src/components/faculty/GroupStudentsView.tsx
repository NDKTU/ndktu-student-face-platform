import { useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ArrowRight, ChevronRight, FolderEdit } from 'lucide-react';
import { useStudents } from '@/hooks/useStudents';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import type { Speciality } from '@/services/specialityService';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import { OrganizationBreadcrumbs } from './OrganizationBreadcrumbs';
import { OrganizationToolbar } from './OrganizationToolbar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';

interface GroupStudentsViewProps {
    faculty: Faculty;
    kafedra?: Kafedra;
    speciality?: Speciality;
    group: Group;
    onBackToFaculties: () => void;
    onBackToKafedras?: () => void;
    onBackToSpecialities?: () => void;
    onBackToGroups: () => void;
    onOpenStudent: (student: Student) => void;
}

export const GroupStudentsView = ({
    faculty,
    kafedra,
    speciality,
    group,
    onBackToFaculties,
    onBackToKafedras,
    onBackToSpecialities,
    onBackToGroups,
    onOpenStudent,
}: GroupStudentsViewProps) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [studentToMove, setStudentToMove] = useState<Student | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const pageSize = 15;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: studentsData, isLoading, isError, refetch } = useStudents(
        currentPage,
        pageSize,
        debouncedSearch,
        undefined,
        group.id
    );
    const students = studentsData?.students || [];
    const totalPages = studentsData ? Math.ceil(studentsData.total / pageSize) : 1;
    const totalCount = studentsData?.total ?? students.length;

    const breadcrumbItems = [
        { label: 'Fakultetlar', onClick: onBackToFaculties },
        { label: faculty.name, onClick: onBackToKafedras || onBackToGroups },
        ...(kafedra ? [{ label: kafedra.name, onClick: onBackToSpecialities || onBackToGroups }] : []),
        ...(speciality ? [{ label: speciality.name, onClick: onBackToGroups }] : []),
        { label: group.name },
    ];

    const columns: DataTableColumn<Student>[] = [
        {
            key: 'id',
            header: '#',
            headClassName: 'w-[60px] text-center font-bold font-mono text-xs',
            className: 'text-center font-mono text-xs font-semibold text-muted-foreground w-[60px]',
            cell: (student: Student) => (currentPage - 1) * pageSize + students.findIndex((s) => s.id === student.id) + 1,
        },
        {
            key: 'full_name',
            header: 'F.I.SH',
            className: 'font-semibold text-foreground',
            cell: (student) => (
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {student.full_name || '-'}
                    </span>
                </div>
            ),
        },
        {
            key: 'student_id_number',
            header: 'Talaba raqami',
            hideBelow: 'sm',
            cell: (student) =>
                student.student_id_number ? (
                    <span className="font-mono text-xs rounded-md bg-muted px-2 py-0.5 border border-border">
                        {student.student_id_number}
                    </span>
                ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                ),
        },
        {
            key: 'phone',
            header: 'Telefon',
            hideBelow: 'md',
            cell: (student) => (
                <span className="font-mono text-xs text-muted-foreground">
                    {student.phone || '—'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Amallar',
            headClassName: 'text-right pr-4',
            className: 'text-right pr-4',
            cell: (student) => (
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Guruhni o'zgartirish"
                        onClick={(e) => {
                            e.stopPropagation();
                            setStudentToMove(student);
                        }}
                    >
                        <FolderEdit className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 gap-1"
                        onClick={() => onOpenStudent(student)}
                    >
                        <span>Tafsilot</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            {/* Unified Dynamic Breadcrumbs */}
            <OrganizationBreadcrumbs
                items={breadcrumbItems}
                onBack={onBackToGroups}
                title={`${group.name} — talabalar`}
                description={`${faculty.name} · ${group.name} guruhiga tegishli talabalar ro'yxati`}
            />

            {/* Toolbar */}
            <OrganizationToolbar
                search={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Talaba F.I.SH yoki raqami bo'yicha..."
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                totalCount={totalCount}
                totalLabel="Talabalar"
            />

            <Card className="border border-border/80 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <DataTable
                        columns={columns}
                        data={students}
                        rowKey={(student) => student.id}
                        isLoading={isLoading}
                        isError={isError}
                        onRetry={() => refetch()}
                        emptyTitle="Talabalar topilmadi"
                        emptyDescription={
                            searchTerm
                                ? `"${searchTerm}" qidiruviga mos talaba topilmadi.`
                                : "Ushbu guruhda hali talabalar ro'yxatga olinmagan."
                        }
                        onRowClick={onOpenStudent}
                        renderCard={(student) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-foreground">{student.full_name || '-'}</p>
                                        <p className="mt-1 text-xs text-muted-foreground font-mono">
                                            {student.student_id_number || '-'} · {student.phone || '-'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            title="Guruhni o'zgartirish"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setStudentToMove(student);
                                            }}
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

            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    isLoading={isLoading}
                />
            )}

            <ChangeGroupModal
                isOpen={!!studentToMove}
                onClose={() => setStudentToMove(null)}
                student={studentToMove}
                onSuccess={() => {
                    setStudentToMove(null);
                    refetch();
                }}
            />
        </div>
    );
};
