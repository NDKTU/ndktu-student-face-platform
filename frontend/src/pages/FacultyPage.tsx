import { useEffect, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { facultyService, type Faculty } from '@/services/facultyService';
import { PermissionGate } from '@/components/auth/PermissionGate';
import type { Group } from '@/services/groupService';
import type { Student } from '@/services/studentService';
import { FacultyModal } from '@/components/faculty/FacultyModal';
import { FacultyDetailsView } from '@/components/faculty/FacultyDetailsView';
import { KafedraTeachersView } from '@/components/faculty/KafedraTeachersView';
import { GroupStudentsView } from '@/components/faculty/GroupStudentsView';
import { StudentDetailView } from '@/components/faculty/StudentDetailView';
import type { Kafedra } from '@/services/kafedraService';

type View =
    | { level: 'faculties' }
    | { level: 'faculty-details'; faculty: Faculty }
    | { level: 'kafedra-teachers'; faculty: Faculty; kafedra: Kafedra }
    | { level: 'group-students'; faculty: Faculty; group: Group }
    | { level: 'student-detail'; faculty: Faculty; group: Group; student: Student };

const FacultyPage = () => {
    const [faculties, setFaculties] = useState<Faculty[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [facultyToDelete, setFacultyToDelete] = useState<Faculty | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [view, setView] = useState<View>({ level: 'faculties' });
    const pageSize = 10;

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const data = await facultyService.getFaculties(currentPage, pageSize, debouncedSearch);
            setFaculties(data.faculties);
            setTotalPages(Math.ceil(data.total / pageSize));
        } catch (error) {
            console.error('Failed to fetch faculties', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { fetchData(); }, [currentPage, debouncedSearch]);

    const handleDeleteClick = (faculty: Faculty) => {
        setFacultyToDelete(faculty);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!facultyToDelete) return;
        try {
            await facultyService.deleteFaculty(facultyToDelete.id, cascadeWarnings.length > 0);
            setFaculties((prev) => prev.filter((item) => item.id !== facultyToDelete.id));
            setIsDeleteModalOpen(false);
            setFacultyToDelete(null);
            setCascadeWarnings([]);
        } catch (error: any) {
            if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                setCascadeWarnings(error.response.data.detail.warnings || []);
            } else {
                console.error("Fakultetni o'chirishda xatolik", error);
                alert("O'chirishda xatolik yuz berdi");
                setIsDeleteModalOpen(false);
                setFacultyToDelete(null);
                setCascadeWarnings([]);
            }
        }
    };

    const handleSuccess = (savedFaculty?: Faculty) => {
        setIsModalOpen(false);
        if (savedFaculty) {
            if (selectedFaculty) {
                setFaculties((prev) => prev.map((f) => (f.id === savedFaculty.id ? savedFaculty : f)));
            } else {
                setFaculties((prev) => [...prev, savedFaculty]);
            }
        } else {
            fetchData();
        }
    };

    if (view.level === 'faculty-details') {
        return (
            <FacultyDetailsView
                faculty={view.faculty}
                onBack={() => setView({ level: 'faculties' })}
                onOpenKafedra={(kafedra) => setView({ level: 'kafedra-teachers', faculty: view.faculty, kafedra })}
                onOpenGroup={(group) => setView({ level: 'group-students', faculty: view.faculty, group })}
            />
        );
    }
    if (view.level === 'kafedra-teachers') {
        return (
            <KafedraTeachersView
                faculty={view.faculty}
                kafedra={view.kafedra}
                onBackToFaculty={() => setView({ level: 'faculty-details', faculty: view.faculty })}
                onBackToFaculties={() => setView({ level: 'faculties' })}
            />
        );
    }
    if (view.level === 'group-students') {
        return (
            <GroupStudentsView
                faculty={view.faculty}
                group={view.group}
                onBackToFaculties={() => setView({ level: 'faculties' })}
                onBackToGroups={() => setView({ level: 'faculty-details', faculty: view.faculty })}
                onOpenStudent={(student) => setView({ level: 'student-detail', faculty: view.faculty, group: view.group, student })}
            />
        );
    }
    if (view.level === 'student-detail') {
        return (
            <StudentDetailView
                faculty={view.faculty}
                group={view.group}
                student={view.student}
                onBackToFaculties={() => setView({ level: 'faculties' })}
                onBackToGroups={() => setView({ level: 'faculty-details', faculty: view.faculty })}
                onBackToStudents={() => setView({ level: 'group-students', faculty: view.faculty, group: view.group })}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Fakultetlar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Universitet fakultetlarini boshqarish</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Qidirish..."
                            className="pl-8 w-[220px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <PermissionGate permission="create:faculty">
                        <Button onClick={() => { setSelectedFaculty(null); setIsModalOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" />
                            Qo'shish
                        </Button>
                    </PermissionGate>
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
                                    <TableHead>Nomi</TableHead>
                                    <TableHead>Yaratilgan sana</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {faculties.map((faculty) => (
                                    <TableRow
                                        key={faculty.id}
                                        className="cursor-pointer"
                                        onClick={() => setView({ level: 'faculty-details', faculty })}
                                    >
                                        <TableCell>{faculty.id}</TableCell>
                                        <TableCell className="font-medium capitalize">{faculty.name}</TableCell>
                                        <TableCell>{new Date(faculty.created_at).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <PermissionGate permission="update:faculty">
                                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedFaculty(faculty); setIsModalOpen(true); }}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </PermissionGate>
                                                <PermissionGate permission="delete:faculty">
                                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteClick(faculty); }}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </PermissionGate>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {faculties.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Fakultetlar topilmadi.</TableCell>
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

            <FacultyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                faculty={selectedFaculty}
                onSuccess={handleSuccess}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => { setIsDeleteModalOpen(false); setCascadeWarnings([]); setFacultyToDelete(null); }}
                onConfirm={handleConfirmDelete}
                title="Fakultetni o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-red-600 font-medium">Diqqat! Ushbu fakultetni o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-red-500">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-red-700 mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${facultyToDelete?.name}" fakultetini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
            />
        </div>
    );
};

export default FacultyPage;
