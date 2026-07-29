import { useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table';
import { ArrowLeft, ChevronRight, FolderEdit, Loader2, Search } from 'lucide-react';
import { useStudents } from '@/hooks/useStudents';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import type { Faculty } from '@/services/facultyService';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import { Crumbs } from './Crumbs';

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

    const { data: studentsData, isLoading } = useStudents(currentPage, pageSize, debouncedSearch, undefined, group.id);
    const students = studentsData?.students || [];
    const totalPages = studentsData ? Math.ceil(studentsData.total / pageSize) : 1;

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
                        <h1 className="text-xl font-semibold tracking-tight">{group.name} — talabalar</h1>
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
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>F.I.SH</TableHead>
                                    <TableHead>Talaba raqami</TableHead>
                                    <TableHead>Telefon</TableHead>
                                    <TableHead className="w-[40px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((student) => (
                                    <TableRow
                                        key={student.id}
                                        className="cursor-pointer"
                                        onClick={() => onOpenStudent(student)}
                                    >
                                        <TableCell>{student.id}</TableCell>
                                        <TableCell className="font-medium">{student.full_name || '-'}</TableCell>
                                        <TableCell>{student.student_id_number || '-'}</TableCell>
                                        <TableCell>{student.phone || '-'}</TableCell>
                                        <TableCell className="text-right">
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
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {students.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Talabalar topilmadi.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
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
