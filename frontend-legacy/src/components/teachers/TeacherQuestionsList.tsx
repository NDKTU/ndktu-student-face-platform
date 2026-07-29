import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import { Loader2, Search, ArrowLeft, Plus, Pencil, Trash2, FileQuestion, Download } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useQuestions, useDeleteQuestion, useBulkDeleteQuestions, useDownloadQuestionsExcel } from '@/hooks/useQuestions';
import type { Teacher } from '@/services/teacherService';
import type { Question } from '@/services/questionService';
import { QuestionDetailModal } from './QuestionDetailModal';

interface TeacherQuestionsListProps {
    teacher: Teacher;
    subject: { id: number; name: string };
    onBack: () => void;
}

export const TeacherQuestionsList = ({ teacher, subject, onBack }: TeacherQuestionsListProps) => {
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
    const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const { data: questionsData, isLoading: isQuestionsLoading } = useQuestions(
        currentPage,
        pageSize,
        debouncedSearch,
        subject.id,
        teacher.employee!.user_id,
    );

    const deleteQuestionMutation = useDeleteQuestion();
    const bulkDeleteMutation = useBulkDeleteQuestions();
    const downloadExcelMutation = useDownloadQuestionsExcel();

    const questions = questionsData?.questions || [];
    const totalPages = questionsData ? Math.ceil(questionsData.total / pageSize) : 1;

    const handleCreateQuestion = () => navigate('/questions/create');

    const handleEditQuestion = (question: Question, e: React.MouseEvent) => {
        e.stopPropagation();
        navigate(`/questions/${question.id}/edit`);
    };

    const handleDeleteClick = (question: Question, e: React.MouseEvent) => {
        e.stopPropagation();
        setQuestionToDelete(question);
        setIsDeleteModalOpen(true);
    };

    const handleViewQuestion = (question: Question) => {
        setSelectedQuestion(question);
        setIsDetailModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!questionToDelete) return;
        deleteQuestionMutation.mutate(questionToDelete.id, {
            onSuccess: () => {
                setIsDeleteModalOpen(false);
                setQuestionToDelete(null);
            },
        });
    };

    const handleBulkDelete = () => {
        if (window.confirm(`Haqiqatan ham "${subject.name}" faniga va ushbu o'qituvchiga tegishli BARCHA savollarni o'chirmoqchimisiz?`)) {
            bulkDeleteMutation.mutate({
                subject_id: subject.id,
                user_id: teacher.employee!.user_id,
            }, {
                onSuccess: (data: any) => {
                    alert(`${data.deleted_count} ta savol o'chirildi`);
                },
                onError: () => alert("Savollarni o'chirishda xatolik yuz berdi"),
            });
        }
    };

    const stripHtml = (html: string) => {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1">
                        <ArrowLeft className="h-4 w-4" />
                        Orqaga
                    </Button>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {teacher.employee!.full_name} — {subject.name}
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">Savollar ro'yxati</p>
                    </div>
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
                    <Button
                        variant="outline"
                        onClick={() => downloadExcelMutation.mutate({ subject_id: subject.id, user_id: teacher.employee!.user_id })}
                        disabled={downloadExcelMutation.isPending}
                    >
                        {downloadExcelMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        Excel yuklab olish
                    </Button>
                    <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={handleBulkDelete}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Barcha savollarni o'chirish
                    </Button>
                    <Button onClick={handleCreateQuestion}>
                        <Plus className="mr-2 h-4 w-4" />
                        Qo'shish
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    {isQuestionsLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
                            <FileQuestion className="h-12 w-12 mb-4 opacity-20" />
                            <p>Ushbu fan va o'qituvchi uchun savollar mavjud emas.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[70%]">Savol</TableHead>
                                    <TableHead className="text-right">Amallar</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {questions.map((question) => {
                                    const plainText = stripHtml(question.text);
                                    return (
                                        <TableRow
                                            key={question.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => handleViewQuestion(question)}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="break-words max-w-2xl" title={plainText}>
                                                    {plainText.length > 150 ? `${plainText.substring(0, 150)}...` : plainText}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => handleEditQuestion(question, e)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={(e) => handleDeleteClick(question, e)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isQuestionsLoading}
            />

            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Savolni o'chirish"
                description="Haqiqatan ham bu savolni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
                confirmText="O'chirish"
                cancelText="Bekor qilish"
            />

            <QuestionDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                question={selectedQuestion}
                subjectName={subject.name}
            />
        </div>
    );
};
