import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ArrowLeft, BookOpen, ArrowRight, GraduationCap, Users } from 'lucide-react';
import type { Teacher } from '@/services/teacherService';
import { cn } from '@/lib/utils';
import { TeacherQuestionsList } from './TeacherQuestionsList';
import { TeacherStudentsPanel } from './TeacherStudentsPanel';

type DetailTab = 'info' | 'courses' | 'students';

const TABS: { id: DetailTab; label: string }[] = [
    { id: 'info', label: "Ma'lumotlar" },
    { id: 'courses', label: 'Kurslar' },
    { id: 'students', label: 'Talabalar' },
];

export const TeacherDetail = ({ teacher, onBack }: { teacher: Teacher; onBack: () => void }) => {
    const [selectedSubject, setSelectedSubject] = useState<{ id: number; name: string } | null>(null);
    const [activeTab, setActiveTab] = useState<DetailTab>('info');
    const courses = teacher.courses ?? [];

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
                        {teacher?.full_name || `O'qituvchi #${teacher.id}`}
                    </h1>
                </div>
            </div>

            <div className="flex border-b border-border overflow-x-auto custom-scrollbar">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'px-4 py-2.5 text-sm transition-colors whitespace-nowrap border-b-2 cursor-pointer',
                            activeTab === tab.id
                                ? 'border-primary text-primary font-bold'
                                : 'border-transparent text-slate-700 dark:text-slate-300 font-semibold hover:text-primary hover:border-primary/40'
                        )}
                    >
                        {tab.label}
                        {tab.id === 'courses' && courses.length > 0 && (
                            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                {courses.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'students' && <TeacherStudentsPanel teacherId={teacher.id} />}

            {activeTab === 'courses' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-muted-foreground" />
                            Kurslar
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {courses.length > 0 ? (
                            <div className="grid gap-2">
                                {courses.map((course) => (
                                    <div
                                        key={course.id}
                                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">{course.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {course.subject_name || "Fan ko'rsatilmagan"}
                                                {course.semester_number ? ` — ${course.semester_number}-semestr` : ''}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                                                <Users className="h-3 w-3" />
                                                {course.group_count} guruh
                                            </span>
                                            <span
                                                className={cn(
                                                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                                    course.role === 'main'
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'bg-secondary/60 text-secondary-foreground'
                                                )}
                                            >
                                                {course.role === 'main' ? 'Asosiy' : 'Yordamchi'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="text-sm text-muted-foreground">Kurs biriktirilmagan.</span>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'info' && (
            <>
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Shaxsiy ma'lumotlar</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">F.I.SH:</span>
                            <span>{teacher?.full_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Ism:</span>
                            <span>{teacher?.first_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Familiya:</span>
                            <span>{teacher?.last_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Otasining ismi:</span>
                            <span>{teacher?.third_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <span className="font-semibold text-muted-foreground">Foydalanuvchi:</span>
                            <span>{teacher.user?.username || '-'}</span>
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
                        {teacher.teacher_subjects && teacher.teacher_subjects.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2">
                                {teacher.teacher_subjects.map(st => (
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
                        {teacher.teacher_groups && teacher.teacher_groups.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                {teacher.teacher_groups.map(gt => (
                                    <li key={gt.group_id}>{gt.group?.name || `ID: ${gt.group_id}`}</li>
                                ))}
                            </ul>
                        ) : (
                            <span className="text-sm text-muted-foreground">Biriktirilgan guruhlar yo'q.</span>
                        )}
                    </CardContent>
                </Card>
            </div>
            </>
            )}
        </div>
    );
};
