import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ArrowLeft, BookOpen, ArrowRight } from 'lucide-react';
import type { Teacher } from '@/services/teacherService';
import { TeacherQuestionsList } from './TeacherQuestionsList';

export const TeacherDetail = ({ teacher, onBack }: { teacher: Teacher; onBack: () => void }) => {
    const [selectedSubject, setSelectedSubject] = useState<{ id: number; name: string } | null>(null);

    if (selectedSubject) {
        return (
            <TeacherQuestionsList
                teacher={teacher}
                subject={selectedSubject}
                onBack={() => setSelectedSubject(null)}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Orqaga
                </Button>
                <div>
                    <h1 className="page-title capitalize">
                        {teacher.employee?.full_name || `O'qituvchi #${teacher.id}`}
                    </h1>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Shaxsiy ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">F.I.SH:</span>
                            <span>{teacher.employee?.full_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Ism:</span>
                            <span>{teacher.employee?.first_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Familiya:</span>
                            <span>{teacher.employee?.last_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Otasining ismi:</span>
                            <span>{teacher.employee?.third_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Foydalanuvchi:</span>
                            <span>{teacher.employee?.user?.username || '-'}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Kafedra ma'lumotlari</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Kafedra:</span>
                            <span>{teacher.kafedra?.name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Fakultet ID:</span>
                            <span>{teacher.kafedra?.faculty_id || '-'}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Biriktirilgan fanlar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {teacher.subject_teachers && teacher.subject_teachers.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2">
                                {teacher.subject_teachers.map(st => (
                                    <div
                                        key={st.subject_id}
                                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer group transition-colors"
                                        onClick={() => setSelectedSubject({ id: st.subject_id, name: st.subject?.name || `ID: ${st.subject_id}` })}
                                    >
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                                            <span>{st.subject?.name || `ID: ${st.subject_id}`}</span>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="text-sm text-muted-foreground">Biriktirilgan fanlar yo'q.</span>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Biriktirilgan guruhlar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {teacher.employee?.user?.group_teachers && teacher.employee.user.group_teachers.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                {teacher.employee.user.group_teachers.map(gt => (
                                    <li key={gt.group_id}>{gt.group?.name || `ID: ${gt.group_id}`}</li>
                                ))}
                            </ul>
                        ) : (
                            <span className="text-sm text-muted-foreground">Biriktirilgan guruhlar yo'q.</span>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
