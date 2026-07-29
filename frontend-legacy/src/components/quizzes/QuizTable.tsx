import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { BookOpen, Camera, Loader2, Pencil, PlayCircle, RotateCcw, Trash2 } from 'lucide-react';
import type { ProctoringMode, Quiz } from '@/services/quizService';

interface QuizTableProps {
    quizzes: Quiz[];
    isLoading: boolean;
    isTeacher: boolean | undefined;
    hasActiveFilters: boolean;
    isUpdatingStatusId: number | null;
    isUpdatePending: boolean;
    isRepeatPending: boolean;
    getSubjectName: (id?: number) => string;
    getGroupName: (id?: number) => string;
    onToggleStatus?: (quiz: Quiz) => void;
    onEdit?: (quiz: Quiz) => void;
    onDelete?: (quiz: Quiz) => void;
    onRepeat?: (quiz: Quiz) => void;
    onStart?: (quiz: Quiz, modeOverride?: ProctoringMode) => void;
    readOnly?: boolean;
}

export const QuizTable = ({
    quizzes,
    isLoading,
    isTeacher,
    hasActiveFilters,
    isUpdatingStatusId,
    isUpdatePending,
    isRepeatPending,
    getSubjectName,
    getGroupName,
    onToggleStatus,
    onEdit,
    onDelete,
    onRepeat,
    onStart,
    readOnly,
}: QuizTableProps) => {
    const hideActions = Boolean(isTeacher) || Boolean(readOnly);
    const showStart = Boolean(onStart);
    if (isLoading) {
        return (
            <Card>
                <CardContent>
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (quizzes.length === 0) {
        return (
            <Card>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <BookOpen className="h-12 w-12 mb-4 opacity-20" />
                        <p>Testlar topilmadi. {hasActiveFilters ? "Filtrlarni o'zgartirib ko'ring." : readOnly ? "Hozircha faol testlar yo'q." : 'Boshlash uchun yangi test yarating.'}</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Sarlavha</TableHead>
                            <TableHead>S/S</TableHead>
                            <TableHead>Davomiyligi</TableHead>
                            <TableHead>PIN</TableHead>
                            <TableHead>Faol</TableHead>
                            <TableHead>Rejim</TableHead>
                            <TableHead>Fan</TableHead>
                            <TableHead>Guruh</TableHead>
                            {(!hideActions || showStart) && <TableHead className="text-right">Amallar</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {quizzes.map((quiz) => (
                            <TableRow key={quiz.id}>
                                <TableCell className="font-medium capitalize">{quiz.title}</TableCell>
                                <TableCell>{quiz.question_number}</TableCell>
                                <TableCell>{quiz.duration} daq</TableCell>
                                <TableCell><span className="font-mono bg-muted px-2 py-1 rounded">{quiz.pin}</span></TableCell>
                                <TableCell>
                                    {hideActions ? (
                                        <span className={`text-xs font-medium ${quiz.is_active ? 'text-green-600' : 'text-muted-foreground'}`}>
                                            {quiz.is_active ? 'Faol' : 'Faol emas'}
                                        </span>
                                    ) : (
                                        <div className="flex items-center space-x-2">
                                            <Switch
                                                checked={quiz.is_active}
                                                onCheckedChange={() => onToggleStatus?.(quiz)}
                                                disabled={isUpdatingStatusId === quiz.id || isUpdatePending}
                                            />
                                            <span className={`text-xs ${quiz.is_active ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                                                {quiz.is_active ? 'Faol' : 'Faol emas'}
                                            </span>
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                            quiz.proctoring_mode === 'face'
                                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                : 'bg-muted text-muted-foreground'
                                        }`}
                                    >
                                        {quiz.proctoring_mode === 'face' ? 'Kamera' : 'Standart'}
                                    </span>
                                </TableCell>
                                <TableCell className="capitalize">{getSubjectName(quiz.subject_id)}</TableCell>
                                <TableCell className="capitalize">{getGroupName(quiz.group_id)}</TableCell>
                                {hideActions && showStart && (
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant={quiz.is_active ? 'primary' : 'outline'}
                                                onClick={() => onStart?.(quiz, 'standard')}
                                                disabled={!quiz.is_active}
                                                title="Standart rejimda boshlash"
                                            >
                                                <PlayCircle className="mr-2 h-4 w-4" />
                                                Standart
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={quiz.is_active ? 'primary' : 'outline'}
                                                onClick={() => onStart?.(quiz, 'face')}
                                                disabled={!quiz.is_active}
                                                title="Kamera (face check) bilan boshlash"
                                            >
                                                <Camera className="mr-2 h-4 w-4" />
                                                Kamera
                                            </Button>
                                        </div>
                                    </TableCell>
                                )}
                                {!hideActions && (
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            {showStart && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    title="Testni boshlash"
                                                    onClick={() => onStart?.(quiz)}
                                                    disabled={!quiz.is_active}
                                                >
                                                    <PlayCircle className="h-4 w-4 text-green-600" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                title="Testni qayta yaratish (2-urinish)"
                                                onClick={() => onRepeat?.(quiz)}
                                                disabled={isRepeatPending}
                                            >
                                                <RotateCcw className="h-4 w-4 text-blue-500" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => onEdit?.(quiz)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => onDelete?.(quiz)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};
