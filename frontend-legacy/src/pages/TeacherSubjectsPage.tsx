import { useAuth } from '@/context/AuthContext';
import { useTeacherAssignedSubjects } from '@/hooks/useSubjects';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader2, BookOpen, ArrowRight } from 'lucide-react';

const TeacherSubjectsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const userId = user?.id;

    const { data, isLoading } = useTeacherAssignedSubjects(userId);

    const subjects = data?.subject_teachers.map((st) => st.subject) || [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Mening Fanlarim</h1>
                <p className="text-muted-foreground mt-2">
                    Sizga biriktirilgan fanlar ro'yxati. Fan tanlab, natijalarni ko'rishingiz mumkin.
                </p>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : subjects.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <div className="rounded-full bg-muted p-4 mb-4">
                            <BookOpen className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">Fanlar biriktirilmagan</h3>
                        <p className="text-muted-foreground mt-1 max-w-sm">
                            Hozircha sizga hech qanday fan biriktirilmagan.
                            Admin bilan bog'laning.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {subjects.map((subject) => (
                        <Card key={subject.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/quizzes?subject_id=${subject.id}`)}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center justify-between">
                                    <span>{subject.name}</span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </CardTitle>
                                <CardDescription>Fan ID: {subject.id}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <BookOpen className="h-4 w-4" />
                                        <span>Testlar va Natijalar</span>
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
