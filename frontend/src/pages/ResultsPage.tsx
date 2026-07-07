import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '@/components/ui/Pagination';
import { useResults, useDeleteResult } from '@/hooks/useResults';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/Table';
import { Card, CardContent } from '@/components/ui/Card';
import {
    Loader2, FileText, X, FileSpreadsheet, Trash2,
    AlertTriangle, BookOpen, Calendar,
    ChevronRight, ArrowRight, Eye, ShieldAlert,
} from 'lucide-react';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/utils';
import { useGroups } from '@/hooks/useGroups';
import { useSubjects } from '@/hooks/useSubjects';
import { useQuizzes } from '@/hooks/useQuizzes';
import { useAuth } from '@/context/AuthContext';
import { resultService, type Result } from '@/services/resultService';

// ─── Grade helpers ────────────────────────────────────────────────────────────

const gradeConfig = {
    5: { label: "A'lo",        bg: 'bg-[hsl(213,65%,38%)]',   text: 'text-white',     ring: 'ring-[hsl(213,65%,38%)]',   softBg: 'bg-[hsl(213,65%,38%)]/10', softText: 'text-[hsl(213,65%,38%)]' },
    4: { label: 'Yaxshi',      bg: 'bg-[hsl(155,43%,30%)]',   text: 'text-white',     ring: 'ring-[hsl(155,43%,30%)]',   softBg: 'bg-[hsl(155,43%,30%)]/10', softText: 'text-[hsl(155,43%,30%)]' },
    3: { label: 'Qoniqarli',   bg: 'bg-[hsl(42,84%,38%)]',    text: 'text-white',     ring: 'ring-[hsl(42,84%,38%)]',    softBg: 'bg-[hsl(42,84%,38%)]/10',  softText: 'text-[hsl(42,84%,38%)]'  },
    2: { label: 'Qoniqarsiz',  bg: 'bg-[hsl(0,65%,42%)]',     text: 'text-white',     ring: 'ring-[hsl(0,65%,42%)]',     softBg: 'bg-[hsl(0,65%,42%)]/10',   softText: 'text-[hsl(0,65%,42%)]'   },
    1: { label: 'Qoniqarsiz',  bg: 'bg-[hsl(0,65%,42%)]',     text: 'text-white',     ring: 'ring-[hsl(0,65%,42%)]',     softBg: 'bg-[hsl(0,65%,42%)]/10',   softText: 'text-[hsl(0,65%,42%)]'   },
} as const;

const getGradeConf = (grade: number) =>
    gradeConfig[grade as keyof typeof gradeConfig] ?? gradeConfig[1];

// ─── Slide-over panel ─────────────────────────────────────────────────────────

interface SlideOverProps {
    result: Result | null;
    onClose: () => void;
    onViewAnswers: (result: Result) => void;
    onDelete?: (id: number) => void;
    isAdmin?: boolean;
}

const SlideOver = ({ result, onClose, onViewAnswers, onDelete, isAdmin }: SlideOverProps) => {
    if (!result) return null;

    const conf = getGradeConf(result.grade);
    const total = result.correct_answers + result.wrong_answers;
    const pct = total > 0 ? Math.round((result.correct_answers / total) * 100) : 0;
    const studentName = result.student_name || result.user?.username || `Foydalanuvchi ${result.user_id}`;

    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />
            <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-card shadow-2xl border-l border-border overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Natija tafsiloti</p>
                        <p className="text-sm font-medium text-foreground mt-0.5 truncate max-w-[260px]">{studentName}</p>
                    </div>
                    <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 px-6 py-5 space-y-5">
                    {/* Grade hero */}
                    <div className={cn('rounded-2xl p-6 text-center', conf.softBg)}>
                        <p className="font-display text-8xl font-semibold tracking-tight leading-none" style={{ color: `hsl(var(--grade-${Math.min(result.grade, 5) as 1|2|3|4|5}))` }}>
                            {result.grade}
                        </p>
                        <p className={cn('mt-2 text-sm font-semibold', conf.softText)}>{conf.label}</p>
                    </div>

                    {/* Score bar */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-foreground">Natija</span>
                            <span className="font-mono text-sm font-semibold text-foreground">{result.correct_answers} / {total}</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                                className={cn('h-full rounded-full transition-all duration-700', conf.bg)}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1.5">
                            <span className="text-xs text-muted-foreground">{result.correct_answers} to'g'ri</span>
                            <span className="text-xs font-mono font-medium text-foreground">{pct}%</span>
                        </div>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-muted/60 p-3">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Fan</p>
                            <p className="text-sm font-medium text-foreground truncate">{result.subject?.name || '—'}</p>
                        </div>
                        <div className="rounded-xl bg-muted/60 p-3">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Test</p>
                            <p className="text-sm font-medium text-foreground truncate">{result.quiz?.title || `Test ${result.quiz_id}`}</p>
                        </div>
                        {result.group && (
                            <div className="rounded-xl bg-muted/60 p-3">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Guruh</p>
                                <p className="text-sm font-medium text-foreground truncate">{result.group.name}</p>
                            </div>
                        )}
                        <div className="rounded-xl bg-muted/60 p-3">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Sana</p>
                            <p className="text-xs font-mono font-medium text-foreground">
                                {new Date(result.created_at).toLocaleString('uz-UZ', { hour12: false })}
                            </p>
                        </div>
                    </div>

                    {/* Cheating evidence */}
                    {result.cheating_detected && (
                        <div className="rounded-2xl border border-[hsl(0,65%,42%)]/25 bg-[hsl(0,65%,42%)]/6 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 text-[hsl(0,65%,42%)] shrink-0" />
                                <p className="text-sm font-semibold text-[hsl(0,65%,42%)]">Firibgarlik aniqlandi</p>
                            </div>
                            {result.reason_for_stop && (
                                <p className="text-xs text-foreground/70 leading-relaxed">{result.reason_for_stop}</p>
                            )}
                            {result.cheating_image_url && (
                                <div className="mt-2 overflow-hidden rounded-xl border border-[hsl(0,65%,42%)]/20">
                                    <img
                                        src={result.cheating_image_url}
                                        alt="Firibgarlik dalili"
                                        className="w-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="shrink-0 px-6 py-4 border-t border-border flex gap-2">
                    <Button
                        variant="primary"
                        className="flex-1"
                        onClick={() => onViewAnswers(result)}
                    >
                        Javoblarni ko'rish
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && onDelete && (
                        <Button
                            variant="outline"
                            className="border-destructive/30 text-destructive hover:bg-destructive/8"
                            onClick={() => onDelete(result.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </aside>
        </>
    );
};

// ─── Student result card ──────────────────────────────────────────────────────

interface ResultCardProps {
    result: Result;
    onClick: () => void;
}

const ResultCard = ({ result, onClick }: ResultCardProps) => {
    const conf = getGradeConf(result.grade);
    const total = result.correct_answers + result.wrong_answers;
    const pct = total > 0 ? Math.round((result.correct_answers / total) * 100) : 0;

    return (
        <button
            onClick={onClick}
            className="group w-full text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {/* Cheating banner */}
            {result.cheating_detected && (
                <div className="flex items-center gap-1.5 mb-3 rounded-lg bg-[hsl(0,65%,42%)]/8 border border-[hsl(0,65%,42%)]/20 px-3 py-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-[hsl(0,65%,42%)] shrink-0" />
                    <span className="text-xs font-medium text-[hsl(0,65%,42%)]">Firibgarlik aniqlandi</span>
                </div>
            )}

            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    {/* Quiz title */}
                    <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {result.quiz?.title || `Test ${result.quiz_id}`}
                    </p>
                    {/* Subject */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{result.subject?.name || '—'}</span>
                    </div>
                </div>

                {/* Grade badge */}
                <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-xl font-semibold', conf.bg, conf.text)}>
                    {result.grade}
                </div>
            </div>

            {/* Score bar */}
            <div className="mt-4">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full rounded-full', conf.bg)} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between mt-1.5">
                    <span className="text-[11px] font-mono text-muted-foreground">
                        {result.correct_answers}/{total} to'g'ri
                    </span>
                    <span className={cn('text-[11px] font-mono font-semibold', conf.softText)}>{pct}%</span>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                        {new Date(result.created_at).toLocaleDateString('uz-UZ')}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Ko'rish <ChevronRight className="h-3 w-3" />
                </div>
            </div>
        </button>
    );
};

// ─── Student hero stats ────────────────────────────────────────────────────────

interface HeroStatsProps {
    results: Result[];
    total: number;
}

const HeroStats = ({ results, total }: HeroStatsProps) => {
    const grades = results.map(r => r.grade);
    const avg = grades.length > 0 ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : '—';
    const best = grades.length > 0 ? Math.max(...grades) : null;

    return (
        <div className="grid grid-cols-3 gap-3">
            {[
                { label: "Jami natijalar", value: total, mono: true },
                { label: "O'rtacha ball", value: avg, mono: true },
                { label: "Eng yuqori ball", value: best ?? '—', mono: true },
            ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl border border-border bg-card px-4 py-4 text-center">
                    <p className="font-display text-3xl font-semibold text-foreground leading-none">{value}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground font-medium">{label}</p>
                </div>
            ))}
        </div>
    );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const ResultsPage = () => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();

    const isStudent = user?.roles?.some(role => role.name.toLowerCase() === 'student');
    const isAdmin = user?.roles?.some(role => role.name.toLowerCase() === 'admin');
    const isAdminOrTeacher = !isStudent;

    const { mutate: deleteResult, isPending: isDeleting } = useDeleteResult();
    const [resultToDelete, setResultToDelete] = useState<number | null>(null);
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);

    const handleDeleteClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setResultToDelete(id);
    };

    const handleConfirmDelete = () => {
        if (resultToDelete) {
            deleteResult(resultToDelete, {
                onSuccess: () => {
                    setResultToDelete(null);
                    if (selectedResult?.id === resultToDelete) setSelectedResult(null);
                }
            });
        }
    };

    const handleViewAnswers = (result: Result) => {
        const params = new URLSearchParams();
        if (result.id) params.set('result_id', String(result.id));
        if (result.user_id) params.set('user_id', String(result.user_id));
        if (result.quiz_id) params.set('quiz_id', String(result.quiz_id));
        navigate(`/results/answers?${params.toString()}`);
    };

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = isStudent ? 12 : 10;

    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedQuiz, setSelectedQuiz] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [usernameSearch, setUsernameSearch] = useState('');
    const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
    const [isExporting, setIsExporting] = useState(false);

    const parsedGroup   = selectedGroup   ? parseInt(selectedGroup, 10)   : undefined;
    const parsedSubject = selectedSubject ? parseInt(selectedSubject, 10) : undefined;
    const parsedQuiz    = selectedQuiz    ? parseInt(selectedQuiz, 10)    : undefined;
    const parsedGrade   = selectedGrade   ? parseInt(selectedGrade, 10)   : undefined;

    useEffect(() => { setCurrentPage(1); }, [selectedGroup, selectedSubject, selectedQuiz, selectedGrade, usernameSearch, sortDir]);

    const { data: resultsData, isLoading: isResultsLoading, isError: isResultsError } = useResults(
        currentPage, pageSize, undefined, parsedGrade, parsedGroup, parsedSubject, parsedQuiz,
        usernameSearch || undefined, sortDir,
        !isAuthLoading
    );

    const { data: groupsData }   = useGroups(1, 1000, '', undefined, undefined, isAdminOrTeacher);
    const { data: subjectsData } = useSubjects(1, 1000, '', undefined, isAdminOrTeacher);
    const { data: quizzesData }  = useQuizzes(1, 1000, undefined, undefined, undefined, undefined, undefined, undefined, isAdminOrTeacher);

    const groups        = groupsData?.groups || [];
    const subjectOptions = subjectsData?.subjects.map(s => ({ value: String(s.id), label: s.name })) || [];
    const quizOptions   = quizzesData?.quizzes.map(q => ({ value: String(q.id), label: q.title })) || [];

    const results    = resultsData?.results || [];
    const totalPages = resultsData ? Math.ceil(resultsData.total / pageSize) : 1;

    const hasActiveFilters = !!(selectedGroup || selectedSubject || selectedQuiz || selectedGrade || usernameSearch || sortDir !== 'desc');

    const handleClearFilters = () => {
        setSelectedGroup('');
        setSelectedSubject('');
        setSelectedQuiz('');
        setSelectedGrade('');
        setUsernameSearch('');
        setSortDir('desc');
        setCurrentPage(1);
    };

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const response = await resultService.getResults(
                1, 10000, parsedGrade, parsedGroup, parsedSubject, parsedQuiz, usernameSearch || undefined, sortDir
            );
            const items = response.results || [];
            if (items.length === 0) { alert('Eksport qilish uchun natijalar topilmadi.'); return; }

            const { utils, writeFile } = await import('xlsx');
            const date = new Date().toLocaleDateString('uz-UZ').replace(/\//g, '.');
            const wsData: unknown[][] = [
                ['NDKTU — Talabalar Natijalari', '', '', '', '', '', ''],
                [`Sana: ${date}`, '', '', `Guruh: ${selectedGroup ? groups.find(g => g.id === parsedGroup)?.name || '-' : 'Barchasi'}`, '', '', ''],
                [],
                isAdminOrTeacher
                    ? ['ID', 'Talaba', 'Guruh', 'Fan', 'Test', 'Ball', "To'g'ri / Jami", 'Sana']
                    : ['ID', 'Fan', 'Test', 'Ball', "To'g'ri / Jami", 'Sana'],
            ];

            items.forEach(r => {
                const dateStr = new Date(r.created_at).toLocaleString('uz-UZ', { hour12: false });
                const name = r.student_name || r.user?.username || `Foydalanuvchi ${r.user_id}`;
                const ratio = `${r.correct_answers} / ${r.correct_answers + r.wrong_answers}`;
                if (isAdminOrTeacher) {
                    wsData.push([r.id, name, r.group?.name || '-', r.subject?.name || '-', r.quiz?.title || '-', r.grade, ratio, dateStr]);
                } else {
                    wsData.push([r.id, r.subject?.name || '-', r.quiz?.title || '-', r.grade, ratio, dateStr]);
                }
            });

            const ws = utils.aoa_to_sheet(wsData);
            ws['!cols'] = isAdminOrTeacher
                ? [{ wch: 8 }, { wch: 38 }, { wch: 22 }, { wch: 28 }, { wch: 38 }, { wch: 8 }, { wch: 14 }, { wch: 20 }]
                : [{ wch: 8 }, { wch: 28 }, { wch: 38 }, { wch: 8 }, { wch: 14 }, { wch: 20 }];
            const wb = utils.book_new();
            utils.book_append_sheet(wb, ws, 'Natijalar');
            writeFile(wb, `Natijalar_${date.replace(/\./g, '-')}.xlsx`);
        } catch {
            alert('Eksport qilishda xatolik yuz berdi.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Natijalar</h1>
                    <p className="page-description mt-0.5">
                        {isStudent ? 'Sizning test natijalaringiz' : 'Talabalar test natijalari va baholari'}
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={handleExportExcel}
                    disabled={isExporting}
                    className="shrink-0"
                >
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                    Excel
                </Button>
            </div>

            {/* Student stats hero */}
            {isStudent && resultsData && (
                <HeroStats results={results} total={resultsData.total} />
            )}

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        {isAdminOrTeacher && (
                            <div className="flex flex-col gap-1.5 min-w-[180px] flex-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Talaba</label>
                                <Input
                                    placeholder="Ism yoki login..."
                                    value={usernameSearch}
                                    onChange={e => setUsernameSearch(e.target.value)}
                                />
                            </div>
                        )}

                        {isAdminOrTeacher && (
                            <div className="flex flex-col gap-1.5 min-w-[160px] flex-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guruh</label>
                                <Combobox
                                    options={groups.map(g => ({ value: String(g.id), label: g.name }))}
                                    value={selectedGroup}
                                    onChange={val => setSelectedGroup(val || '')}
                                    placeholder="Barcha guruhlar"
                                    searchPlaceholder="Qidirish..."
                                />
                            </div>
                        )}

                        <div className="flex flex-col gap-1.5 min-w-[160px] flex-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fan</label>
                            <Combobox
                                options={subjectOptions}
                                value={selectedSubject}
                                onChange={setSelectedSubject}
                                placeholder="Barcha fanlar"
                                searchPlaceholder="Qidirish..."
                            />
                        </div>

                        <div className="flex flex-col gap-1.5 min-w-[160px] flex-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test</label>
                            <Combobox
                                options={quizOptions}
                                value={selectedQuiz}
                                onChange={setSelectedQuiz}
                                placeholder="Barcha testlar"
                                searchPlaceholder="Qidirish..."
                            />
                        </div>

                        <div className="flex flex-col gap-1.5 w-[140px]">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ball</label>
                            <Combobox
                                options={[
                                    { value: '5', label: "5 — A'lo" },
                                    { value: '4', label: '4 — Yaxshi' },
                                    { value: '3', label: '3 — Qoniqarli' },
                                    { value: '2', label: '2 — Qoniqarsiz' },
                                ]}
                                value={selectedGrade}
                                onChange={setSelectedGrade}
                                placeholder="Barcha"
                                searchPlaceholder="Qidirish..."
                            />
                        </div>

                        <div className="flex flex-col gap-1.5 w-[160px]">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saralash</label>
                            <Combobox
                                options={[
                                    { value: 'desc', label: 'Oxirgi avval' },
                                    { value: 'asc', label: 'Eski avval' },
                                ]}
                                value={sortDir}
                                onChange={val => setSortDir(val as 'desc' | 'asc')}
                                placeholder="Saralash..."
                            />
                        </div>

                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="self-end">
                                <X className="mr-1.5 h-3.5 w-3.5" />
                                Tozalash
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Content */}
            {isResultsLoading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : isResultsError ? (
                <p className="py-16 text-center text-sm text-destructive">Xatolik yuz berdi</p>
            ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <FileText className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-sm">Natijalar topilmadi.</p>
                </div>
            ) : isStudent ? (
                /* ── Student: card grid ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.map(result => (
                        <ResultCard
                            key={result.id}
                            result={result}
                            onClick={() => setSelectedResult(result)}
                        />
                    ))}
                </div>
            ) : (
                /* ── Admin/Teacher: table ── */
                <Card>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[60px]">ID</TableHead>
                                    <TableHead>Talaba</TableHead>
                                    <TableHead>Guruh</TableHead>
                                    <TableHead>Fan</TableHead>
                                    <TableHead>Test</TableHead>
                                    <TableHead className="w-[70px]">Ball</TableHead>
                                    <TableHead>Natija</TableHead>
                                    <TableHead>Sana</TableHead>
                                    {isAdmin && <TableHead className="w-[100px]">Amallar</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.map(result => {
                                    const conf = getGradeConf(result.grade);
                                    return (
                                        <TableRow
                                            key={result.id}
                                            className="cursor-pointer hover:bg-muted/40"
                                            onClick={() => setSelectedResult(result)}
                                        >
                                            <TableCell className="font-mono text-xs text-muted-foreground">{result.id}</TableCell>
                                            <TableCell>
                                                <div className="font-medium text-sm">{result.student_name || result.user?.username || `—`}</div>
                                                {result.student_id && (
                                                    <div className="text-xs font-mono text-muted-foreground">{result.student_id}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm">{result.group?.name || '—'}</TableCell>
                                            <TableCell className="text-sm">{result.subject?.name || '—'}</TableCell>
                                            <TableCell className="text-sm max-w-[180px] truncate">{result.quiz?.title || `Test ${result.quiz_id}`}</TableCell>
                                            <TableCell>
                                                <span className={cn(
                                                    'grade-badge h-7 w-7 text-xs',
                                                    conf.bg, conf.text
                                                )}>
                                                    {result.grade}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {result.cheating_detected && (
                                                        <ShieldAlert className="h-3.5 w-3.5 text-[hsl(0,65%,42%)] shrink-0" aria-label="Firibgarlik aniqlandi" />
                                                    )}
                                                    <span className="font-mono text-xs text-foreground">
                                                        {result.correct_answers}/{result.correct_answers + result.wrong_answers}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(result.created_at).toLocaleString('uz-UZ', { hour12: false })}
                                            </TableCell>
                                            {isAdmin && (
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            onClick={e => { e.stopPropagation(); setSelectedResult(result); }}
                                                        >
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-destructive/60 hover:bg-destructive/8 hover:text-destructive"
                                                            onClick={e => handleDeleteClick(e, result.id)}
                                                            disabled={isDeleting}
                                                        >
                                                            {isDeleting && resultToDelete === result.id
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <Trash2 className="h-3.5 w-3.5" />
                                                            }
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isResultsLoading}
            />

            {/* Slide-over */}
            <SlideOver
                result={selectedResult}
                onClose={() => setSelectedResult(null)}
                onViewAnswers={handleViewAnswers}
                onDelete={isAdmin ? id => { setSelectedResult(null); setResultToDelete(id); } : undefined}
                isAdmin={isAdmin}
            />

            <ConfirmDialog
                isOpen={resultToDelete !== null}
                onClose={() => setResultToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Natijani o'chirish"
                description="Haqiqatan ham ushbu natijani o'chirib tashlamoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi."
                confirmText="O'chirish"
                cancelText="Bekor qilish"
                isLoading={isDeleting}
                variant="danger"
            />
        </div>
    );
};

export default ResultsPage;
