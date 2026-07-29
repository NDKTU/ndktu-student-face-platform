import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useGroups } from '@/hooks/useGroups';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader2, Users, ArrowRight, BookOpen } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';

const TeacherGroupsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 12;

    // Assuming user.id is the teacher's ID
    const teacherId = user?.id;

    // Use existing useGroups hook but we need to ensure it supports teacher_id param
    // We might need to update the hook or service if it doesn't support generic params
    const { data, isLoading } = useGroups(currentPage, pageSize, '', teacherId);

    const groups = data?.groups || [];
    const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Mening Guruhlarim</h1>
                <p className="text-muted-foreground mt-2">
                    Sizga biriktirilgan guruhlar ro'yxati. Guruh tanlab, natijalarni ko'rishingiz mumkin.
                </p>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : groups.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <div className="rounded-full bg-muted p-4 mb-4">
                            <Users className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">Guruhlar biriktirilmagan</h3>
                        <p className="text-muted-foreground mt-1 max-w-sm">
                            Hozircha sizga hech qanday guruh biriktirilmagan.
                            Admin bilan bog'laning.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groups.map((group) => (
                        <Card key={group.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/results?group_id=${group.id}`)}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center justify-between">
                                    <span>{group.name}</span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </CardTitle>
                                <CardDescription>Guruh ID: {group.id}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Users className="h-4 w-4" />
                                        <span>Talabalar natijalari</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <BookOpen className="h-4 w-4" />
                                        <span>Fakultet ID: {group.faculty_id}</span>
                                    </div>
                                </div>
                                <Button
                                    className="w-full mt-4"
                                    variant="secondary"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/results?group_id=${group.id}`);
                                    }}
                                >
                                    Natijalarni ko'rish
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                isLoading={isLoading}
            />
        </div>
    );
};

export default TeacherGroupsPage;
