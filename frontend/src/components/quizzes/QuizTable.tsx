import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { tileFor, initialsOf } from '@/lib/avatarTiles';
import { BookOpen, Camera, Pencil, PlayCircle, RotateCcw, Trash2 } from 'lucide-react';
import type { ProctoringMode, Quiz } from '@/services/quizService';

interface QuizTableProps {
    quizzes: Quiz[];
    isLoading: boolean;
    isError?: boolean;
    onRetry?: () => void;
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

/**
 * Список тестов карточной сеткой в стиле референс-дизайна:
 * плитка-инициалы, название, фан/группа, полоса счётчиков, действия.
 */
export const QuizTable = ({
    quizzes,
    isLoading,
    isError,
    onRetry,
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

    if (isError) {
        return <ErrorState onRetry={onRetry} />;
    }
    if (isLoading) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-48 w-full rounded-2xl" />
                ))}
            </div>
        );
    }
    if (quizzes.length === 0) {
        return (
            <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="Testlar topilmadi"
                description={
                    hasActiveFilters
                        ? "Filtrlarni o'zgartirib ko'ring."
                        : readOnly
                            ? "Hozircha faol testlar yo'q."
                            : 'Boshlash uchun yangi test yarating.'
                }
            />
        );
    }

    const renderStartActions = (quiz: Quiz) => (
        <div className="flex flex-wrap gap-2">
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
    );

    const renderManageActions = (quiz: Quiz) => (
        <div className="flex gap-1">
            {showStart && (
                <Button
                    variant="ghost"
                    size="sm"
                    title="Testni boshlash"
                    onClick={() => onStart?.(quiz)}
                    disabled={!quiz.is_active}
                >
                    <PlayCircle className="h-4 w-4 text-success" />
                </Button>
            )}
            <Button
                variant="ghost"
                size="sm"
                title="Testni qayta yaratish (2-urinish)"
                onClick={() => onRepeat?.(quiz)}
                disabled={isRepeatPending}
            >
                <RotateCcw className="h-4 w-4 text-primary" />
            </Button>
            <Button variant="ghost" size="sm" title="Tahrirlash" onClick={() => onEdit?.(quiz)}>
                <Pencil className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="sm"
                title="O'chirish"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete?.(quiz)}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => {
                const subjectName = getSubjectName(quiz.subject_id);
                const groupName = getGroupName(quiz.group_id);
                const subtitle = [subjectName, groupName].filter((v) => v && v !== '-').join(' · ');
                return (
                    <div
                        key={quiz.id}
                        className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                    >
                        <div className="flex items-start gap-3">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tileFor(quiz.id)}`}>
                                {initialsOf(quiz.title)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-display font-semibold capitalize leading-snug text-foreground">{quiz.title}</p>
                                <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">{subtitle || '—'}</p>
                            </div>
                            <span className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-sm" title="PIN kod">{quiz.pin}</span>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-4">
                            <div>
                                <p className="font-display text-lg font-bold text-foreground">{quiz.question_number}</p>
                                <p className="text-xs text-muted-foreground">Savol</p>
                            </div>
                            <div>
                                <p className="font-display text-lg font-bold text-foreground">{quiz.duration}</p>
                                <p className="text-xs text-muted-foreground">Daqiqa</p>
                            </div>
                            <div>
                                <p className={`font-display text-lg font-bold ${quiz.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                                    {quiz.is_active ? 'Faol' : 'Yopiq'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {quiz.proctoring_mode === 'face' ? 'Kamera' : 'Standart'}
                                </p>
                            </div>
                        </div>

                        {(showStart || !hideActions) && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                                {!hideActions && (
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={quiz.is_active}
                                            onCheckedChange={() => onToggleStatus?.(quiz)}
                                            disabled={isUpdatingStatusId === quiz.id || isUpdatePending}
                                        />
                                        <span className="text-xs text-muted-foreground">Faollik</span>
                                    </div>
                                )}
                                <div className="ml-auto">
                                    {hideActions && showStart ? renderStartActions(quiz) : !hideActions ? renderManageActions(quiz) : null}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
