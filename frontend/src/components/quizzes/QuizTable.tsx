import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { tileFor, initialsOf } from '@/lib/avatarTiles';
import { BookOpen, Camera, Link as LinkIcon, Pencil, PlayCircle, RotateCcw, Trash2 } from 'lucide-react';
import type { ProctoringMode, Quiz } from '@/services/quizService';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
    /** 'list' — таблица со списком тестов, 'cards' — карточная сетка. */
    variant?: 'cards' | 'list';
}

/**
 * Список тестов. По умолчанию — карточная сетка (страница активных тестов),
 * variant='list' даёт таблицу как на «Natijalar»: на мобильных DataTable сам
 * переключается на карточки.
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
    variant = 'cards',
}: QuizTableProps) => {
    const navigate = useNavigate();
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

    /** Ochiq testga havola: uni tizimda hisobi yo'q odam ham ochadi. */
    const copyPublicLink = async (quiz: Quiz) => {
        const link = `${window.location.origin}/t/${encodeURIComponent(quiz.pin)}`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success('Havola nusxalandi');
        } catch {
            // Clipboard bloklangan bo'lsa ham havola ko'rinsin.
            toast.info(link);
        }
    };

    const renderManageActions = (quiz: Quiz) => (
        <div className="flex gap-1">
            {quiz.quiz_type === 'PUBLIC_FREE' && (
                <Button
                    variant="ghost"
                    size="sm"
                    title="Ochiq test havolasini nusxalash"
                    onClick={() => void copyPublicLink(quiz)}
                >
                    <LinkIcon className="h-4 w-4 text-primary" />
                </Button>
            )}
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

    if (variant === 'list') {
        const columns: DataTableColumn<Quiz>[] = [
            {
                key: 'title',
                header: 'Test',
                cell: (quiz) => (
                    <div className="min-w-0">
                        <p className="truncate font-medium capitalize text-foreground">{quiz.title}</p>
                        <p className="truncate text-xs capitalize text-muted-foreground">
                            {[getSubjectName(quiz.subject_id), getGroupName(quiz.group_id)]
                                .filter((value) => value && value !== '-')
                                .join(' · ') || '—'}
                        </p>
                    </div>
                ),
            },
            {
                key: 'pin',
                header: 'PIN',
                hideBelow: 'lg',
                className: 'font-mono text-sm text-muted-foreground',
                cell: (quiz) => quiz.pin,
            },
            {
                key: 'question_number',
                header: 'Savol',
                hideBelow: 'md',
                className: 'font-mono text-sm',
                cell: (quiz) => quiz.question_number,
            },
            {
                key: 'duration',
                header: 'Daqiqa',
                hideBelow: 'md',
                className: 'font-mono text-sm',
                cell: (quiz) => quiz.duration,
            },
            {
                key: 'proctoring',
                header: 'Rejim',
                hideBelow: 'lg',
                className: 'text-sm text-muted-foreground',
                cell: (quiz) => (quiz.proctoring_mode === 'face' ? 'Kamera' : 'Standart'),
            },
            {
                key: 'is_active',
                header: 'Holat',
                cell: (quiz) => (
                    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        {!hideActions && (
                            <Switch
                                checked={quiz.is_active}
                                onCheckedChange={() => onToggleStatus?.(quiz)}
                                disabled={isUpdatingStatusId === quiz.id || isUpdatePending}
                            />
                        )}
                        <span className={quiz.is_active ? 'text-sm font-medium text-success' : 'text-sm text-muted-foreground'}>
                            {quiz.is_active ? 'Faol' : 'Yopiq'}
                        </span>
                    </div>
                ),
            },
            {
                key: 'actions',
                header: 'Amallar',
                headClassName: 'text-right',
                className: 'text-right',
                cell: (quiz) => (
                    <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                        {hideActions && showStart ? renderStartActions(quiz) : !hideActions ? renderManageActions(quiz) : null}
                    </div>
                ),
            },
        ];

        return (
            <DataTable
                columns={columns}
                data={quizzes}
                rowKey={(quiz) => quiz.id}
                onRowClick={!readOnly ? (quiz) => navigate(`/quizzes/${quiz.id}`) : undefined}
                renderCard={(quiz) => (
                    <div className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate font-medium capitalize text-foreground">{quiz.title}</p>
                                <p className="truncate text-xs capitalize text-muted-foreground">
                                    {[getSubjectName(quiz.subject_id), getGroupName(quiz.group_id)]
                                        .filter((value) => value && value !== '-')
                                        .join(' · ') || '—'}
                                </p>
                            </div>
                            <span className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs">{quiz.pin}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {quiz.question_number} savol · {quiz.duration} daqiqa · {quiz.proctoring_mode === 'face' ? 'Kamera' : 'Standart'}
                        </p>
                        <div className="flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center gap-2">
                                {!hideActions && (
                                    <Switch
                                        checked={quiz.is_active}
                                        onCheckedChange={() => onToggleStatus?.(quiz)}
                                        disabled={isUpdatingStatusId === quiz.id || isUpdatePending}
                                    />
                                )}
                                <span className={quiz.is_active ? 'text-xs font-medium text-success' : 'text-xs text-muted-foreground'}>
                                    {quiz.is_active ? 'Faol' : 'Yopiq'}
                                </span>
                            </div>
                            {hideActions && showStart ? renderStartActions(quiz) : !hideActions ? renderManageActions(quiz) : null}
                        </div>
                    </div>
                )}
            />
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => {
                const subjectName = getSubjectName(quiz.subject_id);
                const groupName = getGroupName(quiz.group_id);
                const subtitle = [subjectName, groupName].filter((v) => v && v !== '-').join(' · ');
                return (
                    <div
                        key={quiz.id}
                        role={!readOnly ? 'button' : undefined}
                        tabIndex={!readOnly ? 0 : undefined}
                        onClick={() => { if (!readOnly) navigate(`/quizzes/${quiz.id}`); }}
                        onKeyDown={(event) => {
                            if (!readOnly && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault();
                                navigate(`/quizzes/${quiz.id}`);
                            }
                        }}
                        className={`flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md ${!readOnly ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''}`}
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
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3" onClick={(event) => event.stopPropagation()}>
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
