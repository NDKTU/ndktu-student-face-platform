import { useAuth } from '@/context/AuthContext';
import { useTeacherAssignedSubjects } from '@/hooks/useSubjects';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookOpen, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

const TeacherSubjectsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const userId = user?.id;

    const { data, isLoading, isError, refetch } = useTeacherAssignedSubjects(userId);

    const subjects = data?.subject_teachers.map((st) => st.subject) || [];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Mening fanlarim"
                description="Sizga biriktirilgan fanlar ro'yxati. Fan tanlab, testlarni ko'rishingiz mumkin."
            />

            {isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-40 w-full rounded-xl" />
                    ))}
                </div>
            ) : isError ? (
                <Card>
                    <CardContent className="pt-6">
                        <ErrorState onRetry={() => refetch()} />
                    </CardContent>
                </Card>
            ) : subjects.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="pt-6">
                        <EmptyState
                            icon={<BookOpen className="h-6 w-6" />}
                            title="Fanlar biriktirilmagan"
                            description="Hozircha sizga hech qanday fan biriktirilmagan. Admin bilan bog'laning."
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {subjects.map((subject) => (
                        <Card
                            key={subject.id}
                            className="group cursor-pointer transition-all hover:border-primary/40 hover:shadow-md"
                            onClick={() => navigate(`/quizzes?subject_id=${subject.id}`)}
                        >
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center justify-between text-base">
                                    <span className="truncate">{subject.name}</span>
                                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                                </CardTitle>
                                <CardDescription>Fan ID: {subject.id}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <BookOpen className="h-4 w-4" />
                                        <span>Testlar va natijalar</span>
                                    </div>
                                </div>
                                <Button
                                    className="w-full mt-4"
                                    variant="secondary"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/quizzes?subject_id=${subject.id}`);
                                    }}
                                >
                                    Testlarni ko'rish
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeacherSubjectsPage;
