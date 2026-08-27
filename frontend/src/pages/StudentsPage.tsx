import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { type Student } from '@/services/studentService';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Search, ArrowLeft, CheckCircle2, XCircle, Pencil, Trash2, FilterX, Download, FolderEdit } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useStudents, useDeleteStudent } from '@/hooks/useStudents';
import { useUserResults } from '@/hooks/useResults';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/context/AuthContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HemisImportModal } from '@/components/HemisImportModal';
import { ChangeGroupModal } from '@/components/ChangeGroupModal';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { PageTabs } from '@/components/ui/PageTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import type { Result } from '@/services/resultService';

const USER_TABS = [
    { label: 'Tizim foydalanuvchilari', href: '/users' },
    { label: 'Talabalar', href: '/students' },
    { label: "O'qituvchilar", href: '/teachers' },
    { label: 'Xodimlar', href: '/employees' },
];

const StudentsPage = () => {
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [studentToChangeGroup, setStudentToChangeGroup] = useState<Student | null>(null);
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

    const { data: studentsData, isLoading: isStudentsLoading, isError: isStudentsError, refetch } = useStudents(currentPage, pageSize, debouncedSearch, undefined, parsedGroup);
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
                toast.success("Talaba o'chirildi");
                setStudentToDelete(null);
                setCascadeWarnings([]);
            },
            onError: (error: any) => {
                if (error.response?.status === 409 && error.response?.data?.detail?.requires_confirmation) {
                    setCascadeWarnings(error.response.data.detail.warnings || []);
                } else {
                    toast.error("Talabani o'chirishda xatolik yuz berdi");
                    setStudentToDelete(null);
                    setCascadeWarnings([]);
                }
            }
        });
    };

    // Кнопки действий — общие для строки таблицы и мобильной карточки
    const renderActions = (student: Student) => (
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
            <PermissionGate permission="update:student">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        toast.info("Tahrirlash funksiyasi tez orada qo'shiladi");
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
                    className="text-destructive hover:text-destructive"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PermissionGate>
        </div>
    );

    const columns: DataTableColumn<Student>[] = [
        {
            key: 'full_name',
            header: 'F.I.SH/User ID',
            className: 'font-medium',
            cell: (student) => (
                <>
                    <div className="capitalize">{student.full_name || 'Noma\'lum'}</div>
                    <div className="text-xs text-muted-foreground">ID: {student.user_id}</div>
                </>
            ),
        },
        { key: 'phone', header: 'Telefon', hideBelow: 'lg', cell: (student) => student.phone || '-' },
        {
            key: 'address',
            header: 'Manzil',
            hideBelow: 'lg',
            className: 'max-w-[200px] truncate',
            cell: (student) => <span title={student.address || ''}>{student.address || '-'}</span>,
        },
        {
            key: 'created_at',
            header: 'Yaratilgan sana',
            hideBelow: 'lg',
            cell: (student) => new Date(student.created_at).toLocaleDateString(),
        },
        {
            key: 'actions',
            header: 'Amallar',
            headClassName: 'text-right',
            cell: (student) => renderActions(student),
        },
    ];

    if (viewMode === 'detail' && selectedStudent) {
        return <StudentDetail student={selectedStudent} onBack={handleBackToList} />;
    }

    return (
        <div className="space-y-6">
            <PageTabs tabs={USER_TABS} />
            <PageHeader
                title="Talabalar"
                description="Talabalar ro'yxati va ma'lumotlarini boshqarish"
                actions={
                    <>
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
                    </>
                }
            />
            <Card>
                <CardContent className="pt-6">
                    <DataTable
                        columns={columns}
                        data={students}
                        rowKey={(student) => student.id}
                        isLoading={isStudentsLoading}
                        isError={isStudentsError}
                        onRetry={() => refetch()}
                        emptyTitle="Talabalar topilmadi"
                        emptyDescription="Qidiruv mezonlariga mos talaba yo'q."
                        onRowClick={handleViewStudent}
                        renderCard={(student) => (
                            <div className="rounded-xl border border-border bg-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium capitalize text-foreground">{student.full_name || 'Noma\'lum'}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            ID: {student.user_id} · {student.phone || '-'}
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground truncate" title={student.address || ''}>
                                            {student.address || '-'}
                                        </p>
                                    </div>
                                    {renderActions(student)}
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
                            <p className="text-destructive font-medium">Diqqat! Ushbu talabani o'chirish quyidagi ma'lumotlarni ham o'chiradi:</p>
                            <ul className="list-disc pl-5 text-sm text-destructive/90">
                                {cascadeWarnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                            <p className="font-semibold text-destructive mt-2">Tasdiqlaysizmi? Bu amalni bekor qilib bo'lmaydi!</p>
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
        </div>
    );
};

const StudentDetail = ({ student, onBack }: { student: Student; onBack: () => void }) => {
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;
    const { data: resultsData, isLoading: isResultsLoading, isError: isResultsError, refetch } = useUserResults(student.user_id, currentPage, pageSize);

    const results: Result[] = resultsData?.results || [];
    const totalPages = resultsData ? Math.ceil(resultsData.total / pageSize) : 1;

    const renderResultScore = (result: Result) => (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                    {result.grade.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">/ 5</span>
                </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{result.correct_answers}</span>
                </div>
                <div className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{result.wrong_answers}</span>
                </div>
            </div>
        </div>
    );

    const resultColumns: DataTableColumn<Result>[] = [
        {
            key: 'quiz',
            header: 'Test Nomi',
            className: 'font-medium align-middle capitalize',
            cell: (result) => (
                <>
                    {result.quiz?.title || '-'}
                    {result.quiz?.attempt === 2 && (
                        <span className="ml-2 badge badge-primary normal-case">
                            Qayta ishlash
                        </span>
                    )}
                </>
            ),
        },
        { key: 'subject', header: 'Fan', className: 'align-middle capitalize', cell: (result) => result.subject?.name || '-' },
        {
            key: 'created_at',
            header: "Test o'tkazilgan sana",
            hideBelow: 'lg',
            className: 'align-middle',
            cell: (result) => new Date(result.created_at).toLocaleDateString(),
        },
        { key: 'grade', header: 'Natija', className: 'align-middle', cell: renderResultScore },
        {
            key: 'details',
            header: 'Batafsil',
            headClassName: 'text-right',
            className: 'text-right align-middle',
            cell: (result) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/results/answers?user_id=${student.user_id}&quiz_id=${result.quiz_id}`);
                    }}
                >
                    Javoblarni ko'rish
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Orqaga
                </Button>
                <div>
                    <h1 className="page-title">{student.full_name || `Talaba #${student.id}`}</h1>
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
                    <div className="space-y-4">
                        <DataTable
                            columns={resultColumns}
                            data={results}
                            rowKey={(result) => result.id}
                            onRowClick={(result) => navigate(
                                `/results/answers?user_id=${student.user_id}&quiz_id=${result.quiz_id}`
                            )}
                            isLoading={isResultsLoading}
                            isError={isResultsError}
                            onRetry={() => refetch()}
                            emptyTitle="Natijalar topilmadi"
                            emptyDescription="Ushbu talaba uchun natijalar topilmadi."
                            renderCard={(result) => (
                                <div className="rounded-xl border border-border bg-card p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-medium capitalize text-foreground">
                                                {result.quiz?.title || '-'}
                                                {result.quiz?.attempt === 2 && (
                                                    <span className="ml-2 badge badge-primary normal-case">
                                                        Qayta ishlash
                                                    </span>
                                                )}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground capitalize">
                                                {result.subject?.name || '-'} · {new Date(result.created_at).toLocaleDateString()}
                                            </p>
                                            <div className="mt-2">{renderResultScore(result)}</div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => navigate(`/results/answers?user_id=${student.user_id}&quiz_id=${result.quiz_id}`)}
                                        >
                                            Javoblarni ko'rish
                                        </Button>
                                    </div>
                                </div>
                            )}
                        />
                        {results.length > 0 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                isLoading={isResultsLoading}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default StudentsPage;
