import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMethods } from '@/hooks/usePsychology';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { Loader2, Brain, ListOrdered, Play } from 'lucide-react';

export default function StudentPsychologyPage() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const { data, isLoading, isError } = useMethods(page, 20);

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Brain className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Psixologik testlar</h1>
                    <p className="text-xs text-muted-foreground">O'zingizni sinab ko'ring</p>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-0">
                    <p className="text-sm text-muted-foreground">
                        Mavjud: <span className="font-medium text-foreground">{data?.total ?? 0}</span> ta test
                    </p>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : isError ? (
                        <p className="py-8 text-center text-sm text-destructive">Xatolik yuz berdi</p>
                    ) : !data?.methods.length ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center">
                            <Brain className="h-10 w-10 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">Hozircha testlar mavjud emas</p>
                        </div>
                    ) : (
                        <>
                            <div className="mt-4 flex flex-col gap-2">
                                {data.methods.map(method => {
                                    const hasQuestions = method.questions.length > 0;
                                    return (
                                        <div
                                            key={method.id}
                                            className="flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/30 hover:bg-accent/30"
                                        >
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                                <Brain className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-foreground truncate">{method.name}</p>
                                                <p className="text-xs text-muted-foreground truncate">{method.description}</p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                                <ListOrdered className="h-3.5 w-3.5" />
                                                <span>{method.questions.length} savol</span>
                                            </div>
                                            <button
                                                onClick={() => navigate(`/psychology/test/${method.id}`)}
                                                disabled={!hasQuestions}
                                                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Play className="h-3.5 w-3.5" />
                                                Boshlash
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {data.total > 20 && (
                                <div className="mt-4">
                                    <Pagination
                                        currentPage={page}
                                        totalPages={Math.ceil(data.total / 20)}
                                        onPageChange={setPage}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
