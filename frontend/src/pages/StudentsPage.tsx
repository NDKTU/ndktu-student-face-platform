import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { type Student } from '@/services/studentService';
import { Button } from '@/components/ui/Button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Loader2, Search, ArrowLeft, CheckCircle2, XCircle, Pencil, Trash2, FilterX, Download, FolderEdit, History } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useStudents, useDeleteStudent } from '@/hooks/useStudents';
import { useUserResults } from '@/hooks/useResults';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/context/AuthContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HemisImportModal } from '@/components/HemisImportModal';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import { StudentMovementsModal } from '@/components/StudentMovementsModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';

const USER_TABS = [
    { label: 'Tizim foydalanuvchilari', href: '/users' },
    { label: 'Talabalar', href: '/students' },
    { label: "O'qituvchilar", href: '/teachers' },
    { label: 'Tyutorlar', href: '/tutors' },
];

const StudentsPage = () => {
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [studentToChangeGroup, setStudentToChangeGroup] = useState<Student | null>(null);
    const [studentMovementsTarget, setStudentMovementsTarget] = useState<Student | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
    const pageSize = 10;
    const deleteMutation = useDeleteStudent();

    const parsedGroup = selectedGroup ? parseInt(selectedGroup, 10) : undefined;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { hasPermission } = useAuth();
    const canReadGroup = hasPermission('read:group');

    const { data: studentsData, isLoading: isStudentsLoading } = useStudents(currentPage, pageSize, debouncedSearch, undefined, parsedGroup);
    const { data: groupsData } = useGroups(1, 100, '', undefined, undefined, canReadGroup);

    const groupOptions = groupsData?.groups.map(g => ({ value: String(g.id), label: g.name })) || [];

    const students = studentsData?.students || [];
    const totalPages = studentsData ? Math.ceil(studentsData.total / pageSize) : 1;

    const handleViewStudent = (student: Student) => {
        setSelectedStudent(student);
        setViewMode('detail');
    };

    const handleBackToList = () => {
        setSelectedStudent(null);
        setViewMode('list');
    };

    const handleDelete = () => {
        if (!studentToDelete) return;
        deleteMutation.mutate({ id: studentToDelete.id, force: cascadeWarnings.length > 0 }, {
            onSuccess: () => {
                setStudentToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    alert('Talabani o`chirishda xatolik yuz berdi');
                    setStudentToDelete(null);
                    setCascadeWarnings([]);
                }
            }
        });
    };

    if (viewMode === 'detail' && selectedStudent) {
        return <StudentDetail student={selectedStudent} onBack={handleBackToList} />;
    }

    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Talabalar</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">Talabalar ro'yxati va ma'lumotlarini boshqarish</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                        <Download className="mr-2 h-4 w-4" />
                        Hemisdan Import
                    </Button>
                    <PermissionGate permission="read:group">
                        <div className="w-[180px]">
                            <Combobox
                                options={groupOptions}
                                value={selectedGroup}
                                onChange={setSelectedGroup}
                                placeholder="Barcha guruhlar"
                            />
                        </div>
                    </PermissionGate>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Qidirish..."
                            className="pl-8 w-[220px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {(searchTerm || selectedGroup) && (
                        <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(''); setSelectedGroup(''); }}>
                            <FilterX className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
            <Card>
                <CardContent>
                    {isStudentsLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>F.I.SH/User ID</TableHead>
                                    <TableHead>Telefon</TableHead>
                                    <TableHead>Manzil</TableHead>
                                    <TableHead>Yaratilgan sana</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((student) => (
                                    <TableRow
                                        key={student.id}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        onClick={() => handleViewStudent(student)}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="capitalize">{student.full_name || 'Noma\'lum'}</div>
                                            <div className="text-xs text-muted-foreground">ID: {student.user_id}</div>
                                        </TableCell>
                                        <TableCell>{student.phone || '-'}</TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={student.address || ''}>
                                            {student.address || '-'}
                                        </TableCell>
                                        <TableCell>{new Date(student.created_at).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    title="Guruhni o'zgartirish"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setStudentToChangeGroup(student);
                                                    }}
                                                >
                                                    <FolderEdit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    title="Harakatlar tarixi"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setStudentMovementsTarget(student);
                                                    }}
                                                >
                                                    <History className="h-4 w-4" />
                                                </Button>
                                                <PermissionGate permission="update:student">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            alert('Tahrirlash funksiyasi tez orada qo`shiladi');
                                                        }}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </PermissionGate>
                                                <PermissionGate permission="delete:student">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setStudentToDelete(student);
                                                            setCascadeWarnings([]);
                                                        }}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </PermissionGate>
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
                isLoading={isStudentsLoading}
            />

            <ConfirmDialog
                isOpen={!!studentToDelete}
                onClose={() => { setStudentToDelete(null); setCascadeWarnings([]); }}
                onConfirm={handleDelete}
                title="Talabani o'chirish"
                description={
                    cascadeWarnings.length > 0 ? (
                        <div className="space-y-2 mt-2 text-left">
                            <p className="text-red-600 font-medium">Diqqat! Ushbu talabani o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-red-500">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-red-700 mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
                        </div>
                    ) : `Siz haqiqatan ham "${studentToDelete?.full_name}" talabasini o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.`
                }
                confirmText={cascadeWarnings.length > 0 ? "Ha, majburiy o'chirish" : "O'chirish"}
                cancelText="Bekor qilish"
                variant="danger"
            />

            <HemisImportModal 
                isOpen={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)} 
            />

            <ChangeGroupModal
                isOpen={!!studentToChangeGroup}
                onClose={() => setStudentToChangeGroup(null)}
                student={studentToChangeGroup}
            />

            <StudentMovementsModal
                student={studentMovementsTarget}
                onClose={() => setStudentMovementsTarget(null)}
            />
        </div>
    );
};

const StudentDetail = ({ student, onBack }: { student: Student; onBack: () => void }) => {
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;
    const { data: resultsData, isLoading: isResultsLoading } = useUserResults(student.user_id, currentPage, pageSize);

    const results = resultsData?.results || [];
    const totalPages = resultsData ? Math.ceil(resultsData.total / pageSize) : 1;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Orqaga
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{student.full_name || `Talaba #${student.id}`}</h1>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Shaxsiy ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">F.I.SH:</span>
                            <span>{student.full_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">User ID:</span>
                            <span>{student.user_id}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Telefon raqami:</span>
                            <span>{student.phone || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Manzil:</span>
                            <span>{student.address || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Talaba raqami:</span>
                            <span>{student.student_id_number || '-'}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Akademik ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Fakultet:</span>
                            <span>{student.faculty || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Mutaxassislik:</span>
                            <span>{student.specialty || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Bosqich:</span>
                            <span>{student.level || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Semestr:</span>
                            <span>{student.semester || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">O'rtacha ball (GPA):</span>
                            <span>{student.avg_gpa ?? '-'}</span>
                        </div>
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
                                        <TableHead>Test o'tkazilgan sana</TableHead>
                                        <TableHead>Natija</TableHead>
                                        <TableHead className="text-right">Batafsil</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.map((result) => (
                                        <TableRow key={result.id}>
                                            <TableCell className="font-medium align-middle capitalize">
                                                {result.quiz?.title || '-'}
                                                {result.quiz?.attempt === 2 && (
                                                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300 normal-case">
                                                        Qayta ishlash
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="align-middle capitalize">{result.subject?.name || '-'}</TableCell>
                                            <TableCell className="align-middle">{new Date(result.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell className="align-middle">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg font-bold">
                                                            {result.grade.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ 5</span>
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs">
                                                        <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            <span>{result.correct_answers}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-red-600 dark:text-red-500">
                                                            <XCircle className="h-3.5 w-3.5" />
                                                            <span>{result.wrong_answers}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right align-middle">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/user-answers?user_id=${student.user_id}&quiz_id=${result.quiz_id}`)}
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
                            {results.length > 0 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                    isLoading={isResultsLoading}
                                />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default StudentsPage;
