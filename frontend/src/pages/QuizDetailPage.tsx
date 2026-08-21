import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, Clock3, ExternalLink, UsersRound } from 'lucide-react';
import { useQuiz, useQuizAnalytics } from '@/hooks/useQuizzes';
import { useResults } from '@/hooks/useResults';
import { HierarchyHeader } from '@/components/catalog/HierarchyHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { sanitizeHtml } from '@/utils/sanitize';

const formatDuration = (seconds?: number | null) => {
    if (seconds === null || seconds === undefined) return '—';
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}m ${rest}s`;
};

const QuizDetailPage = () => {
    const navigate = useNavigate();
    const quizId = Number(useParams().id);
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const quiz = useQuiz(quizId);
    const analytics = useQuizAnalytics(quizId);
    const results = useResults(page, pageSize, undefined, undefined, undefined, undefined, quizId);

    if (quiz.isError || analytics.isError) {
        return <ErrorState onRetry={() => { void quiz.refetch(); void analytics.refetch(); }} />;
    }
    if (quiz.isLoading || analytics.isLoading) {
        return <div className="space-y-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
    }
    if (!quiz.data || !analytics.data) return <EmptyState title="Test topilmadi" />;

    const data = analytics.data;
    const resultItems = results.data?.results ?? [];
    const totalPages = Math.max(1, Math.ceil((results.data?.total ?? 0) / pageSize));

    return (
        <div className="space-y-6">
            <HierarchyHeader
                title={quiz.data.title}
                description={`PIN: ${quiz.data.pin} · ${quiz.data.question_number} savol · ${quiz.data.duration} daqiqa`}
                onBack={() => navigate('/quizzes')}
                actions={
                    <Button variant="outline" onClick={() => navigate('/results')}>
                        Eski Results sahifasi <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                }
            />

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Test statistikasi">
                {[
                    { label: 'Topshirgan', value: `${data.submitted_count}/${data.total_students}`, icon: UsersRound },
                    { label: "O'rtacha baho", value: data.average_grade ?? '—', icon: BarChart3 },
                    { label: 'Eng past / yuqori', value: data.minimum_grade === null || data.minimum_grade === undefined ? '—' : `${data.minimum_grade} / ${data.maximum_grade}`, icon: BarChart3 },
                    { label: "O'rtacha vaqt", value: formatDuration(data.average_duration_seconds), icon: Clock3 },
                ].map(({ label, value, icon: Icon }) => (
                    <Card key={label}>
                        <CardContent className="flex items-center gap-4 p-5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                            <div><p className="font-display text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
                        </CardContent>
                    </Card>
                ))}
            </section>

            <Card>
                <CardContent className="p-6">
                    <div className="mb-5">
                        <h2 className="font-display text-lg font-semibold">Talabalar natijalari</h2>
                        <p className="text-sm text-muted-foreground">Testning oxirgi yakunlangan urinishlari</p>
                    </div>
                    {results.isError ? <ErrorState onRetry={() => results.refetch()} /> : results.isLoading ? (
                        <Skeleton className="h-64 rounded-xl" />
                    ) : resultItems.length === 0 ? (
                        <EmptyState title="Natijalar hali yo'q" description="Talabalar testni topshirgach natijalar shu yerda ko'rinadi." />
                    ) : (
                        <Table>
                            <TableHeader><TableRow><TableHead>Talaba</TableHead><TableHead>Natija</TableHead><TableHead>Baho</TableHead><TableHead className="text-right">Javoblar</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {resultItems.map((result) => (
                                    <TableRow key={result.id}>
                                        <TableCell className="font-medium">{result.student_name || result.user?.username || `#${result.user_id}`}</TableCell>
                                        <TableCell>{result.correct_answers}/{result.correct_answers + result.wrong_answers}</TableCell>
                                        <TableCell><span className="badge badge-primary">{result.grade}</span></TableCell>
                                        <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/results/answers?result_id=${result.id}&user_id=${result.user_id}&quiz_id=${quizId}`)}>Ko'rish</Button></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    <div className="mt-4"><Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={results.isLoading} /></div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-6">
                    <div className="mb-5">
                        <h2 className="font-display text-lg font-semibold">Savollar tahlili</h2>
                        <p className="text-sm text-muted-foreground">Har bir savol bo'yicha to'g'ri va noto'g'ri javoblar</p>
                    </div>
                    {data.questions.length === 0 ? <EmptyState title="Tahlil uchun ma'lumot yo'q" /> : (
                        <div className="space-y-3">
                            {data.questions.map((question, index) => (
                                <article key={question.question_id} className="rounded-xl border border-border/60 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex min-w-0 gap-3">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                                            <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.question_text) }} />
                                        </div>
                                        <span className="shrink-0 font-mono text-sm font-semibold text-primary">{question.correct_percent}%</span>
                                    </div>
                                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${question.correct_percent}%` }} /></div>
                                    <p className="mt-2 text-xs text-muted-foreground">{question.correct_count} to'g'ri · {question.wrong_count} noto'g'ri</p>
                                </article>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default QuizDetailPage;
