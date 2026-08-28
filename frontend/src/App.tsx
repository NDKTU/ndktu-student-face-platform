import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import MainLayout from '@/components/layout/MainLayout';
import FocusLayout from '@/components/layout/FocusLayout';
import { Toaster } from '@/components/ui/Toaster';

import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useGlobalErrorLogger } from '@/hooks/useGlobalErrorLogger';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Code splitting: каждая страница — отдельный чанк, тяжёлые зависимости
// (jodit, xlsx, recharts) не попадают в начальный бандл.
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const StudentDashboardPage = lazy(() => import('@/pages/StudentDashboardPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const QuizzesPage = lazy(() => import('@/pages/QuizzesPage'));
const QuizDetailPage = lazy(() => import('@/pages/QuizDetailPage'));
const ActiveQuizzesPage = lazy(() => import('@/pages/ActiveQuizzesPage'));
const ResultsPage = lazy(() => import('@/pages/ResultsPage'));
const TeachersPage = lazy(() => import('@/pages/TeachersPage'));
const HemisSyncPage = lazy(() => import('@/pages/HemisSyncPage'));
const EduPlanSyncPage = lazy(() => import('@/pages/EduPlanSyncPage'));
const FacultyPage = lazy(() => import('@/pages/FacultyPage'));
const KafedraPage = lazy(() => import('@/pages/KafedraPage'));
const GroupsPage = lazy(() => import('@/pages/GroupsPage'));
const SubjectsPage = lazy(() => import('@/pages/SubjectsPage'));
const CoursesPage = lazy(() => import('@/pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('@/pages/CourseDetailPage'));
const StudentsPage = lazy(() => import('@/pages/StudentsPage'));
const QuestionsPage = lazy(() => import('@/pages/QuestionsPage'));
const QuestionFormPage = lazy(() => import('@/pages/QuestionFormPage'));
const QuizTestPage = lazy(() => import('@/pages/QuizTestPage'));
const UserAnswersPage = lazy(() => import('@/pages/UserAnswersPage'));
const TeacherGroupsPage = lazy(() => import('@/pages/TeacherGroupsPage'));
const TeacherSubjectsPage = lazy(() => import('@/pages/TeacherSubjectsPage'));
const TeacherRankingPage = lazy(() => import('@/pages/TeacherRankingPage'));
const PsychologyPage = lazy(() => import('@/pages/PsychologyPage'));
const PsychologyTestPage = lazy(() => import('@/pages/PsychologyTestPage'));
const PsychologyResultsPage = lazy(() => import('@/pages/PsychologyResultsPage'));
const StudentPsychologyPage = lazy(() => import('@/pages/StudentPsychologyPage'));
const LessonsPage = lazy(() => import('@/pages/LessonsPage'));
const LessonDetailPage = lazy(() => import('@/pages/LessonDetailPage'));
const HomeworksPage = lazy(() => import('@/pages/HomeworksPage'));
const HomeworkSubmissionsPage = lazy(() => import('@/pages/HomeworkSubmissionsPage'));
const RolesPage = lazy(() => import('@/pages/RolesPage'));
const RolePermissionsPage = lazy(() => import('@/pages/RolePermissionsPage'));
const PermissionsPage = lazy(() => import('@/pages/PermissionsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const PageSpinner = () => (
    <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
);

const ProtectedRoute = () => {
    useIdleTimeout();
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <PageSpinner />;
    }

    return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const PermissionRoute = ({ permission, children }: { permission: string | string[]; children: React.ReactElement }) => {
    const { hasAnyPermission, isLoading } = useAuth();

    if (isLoading) {
        return <PageSpinner />;
    }

    const required = Array.isArray(permission) ? permission : [permission];
    if (!hasAnyPermission(...required)) {
        return <Navigate to="/" replace />;
    }
    return children;
};

const DashboardRedirect = () => {
    const { user, activeRole } = useAuth();
    // Bir nechta roli borlar uchun tanlangan ko'rinish hal qiladi.
    const scope = activeRole ? [activeRole] : (user?.roles ?? []);
    const isStudent = scope.some(role => role.name.toLowerCase() === 'student');
    const isTeacher = scope.some(role => role.name.toLowerCase() === 'teacher');
    const isPsixologik = scope.some(role => role.name.toLowerCase() === 'psixologik');

    if (isPsixologik) {
        return <Navigate to="/psychology" replace />;
    }

    if (isStudent) {
        return <StudentDashboardPage />;
    }

    if (isTeacher) {
        return <Navigate to="/questions" replace />;
    }

    return <Dashboard />;
};

function App() {
    useGlobalErrorLogger();
    return (
        <ErrorBoundary>
            <ThemeProvider>
                <AuthProvider>
                    <Router>
                        <Suspense fallback={<PageSpinner />}>
                            <Routes>
                                <Route path="/login" element={<Login />} />

                                <Route element={<ProtectedRoute />}>
                                    {/* Фокус-режим: прохождение тестов без сайдбара */}
                                    <Route element={<FocusLayout />}>
                                        <Route path="/psychology/test/:methodId" element={<PermissionRoute permission="read:psychology"><PsychologyTestPage /></PermissionRoute>} />
                                    </Route>

                                    <Route element={<MainLayout />}>
                                        <Route path="/quiz-test" element={<PermissionRoute permission="quiz_process:start_quiz"><QuizTestPage /></PermissionRoute>} />
                                        <Route path="/" element={<DashboardRedirect />} />
                                        <Route path="/profile" element={<ProfilePage />} />

                                        <Route path="/dashboard" element={<Dashboard />} />
                                        <Route path="/users" element={<PermissionRoute permission="read:user"><UsersPage /></PermissionRoute>} />
                                        <Route path="/roles" element={<PermissionRoute permission="read:role"><RolesPage /></PermissionRoute>} />
                                        <Route path="/roles/:id/permissions" element={<PermissionRoute permission="read:role"><RolePermissionsPage /></PermissionRoute>} />
                                        <Route path="/permissions" element={<PermissionRoute permission="read:permission"><PermissionsPage /></PermissionRoute>} />
                                        <Route path="/teachers" element={<PermissionRoute permission="read:teacher"><TeachersPage /></PermissionRoute>} />
                                        <Route path="/teacher-ranking" element={<PermissionRoute permission="read:teacher"><TeacherRankingPage /></PermissionRoute>} />

                                        <Route path="/faculties" element={<PermissionRoute permission="read:faculty"><FacultyPage /></PermissionRoute>} />
                                        <Route path="/kafedras" element={<PermissionRoute permission="read:kafedra"><KafedraPage /></PermissionRoute>} />
                                        <Route path="/groups" element={<PermissionRoute permission="read:group"><GroupsPage /></PermissionRoute>} />
                                        <Route path="/students" element={<PermissionRoute permission="read:student"><StudentsPage /></PermissionRoute>} />
                                        <Route path="/admin/hemis-sync" element={<PermissionRoute permission="hemis_admin_sync"><HemisSyncPage /></PermissionRoute>} />
                                        <Route path="/admin/eduplan-sync" element={<PermissionRoute permission="sync:eduplan"><EduPlanSyncPage /></PermissionRoute>} />

                                        <Route path="/lessons" element={<PermissionRoute permission="read:lesson"><LessonsPage /></PermissionRoute>} />
                                        <Route path="/lessons/:id" element={<PermissionRoute permission="read:lesson"><LessonDetailPage /></PermissionRoute>} />
                                        <Route path="/homework" element={<PermissionRoute permission="read:homework"><HomeworksPage /></PermissionRoute>} />
                                        {/* Ishlarni tekshirish — `update:submission` faqat o'qituvchi/adminda:
                                            talabada `read:submission` bor, lekin bu sahifa unga emas. */}
                                        <Route path="/homework/:id/submissions" element={<PermissionRoute permission="update:submission"><HomeworkSubmissionsPage /></PermissionRoute>} />
                                        <Route path="/psychology" element={<PermissionRoute permission="read:psychology"><PsychologyPage /></PermissionRoute>} />
                                        <Route path="/psychology/results" element={<PermissionRoute permission="read:psychology_results"><PsychologyResultsPage /></PermissionRoute>} />
                                        <Route path="/psychology/student" element={<PermissionRoute permission="read:psychology"><StudentPsychologyPage /></PermissionRoute>} />

                                        <Route path="/subjects" element={<PermissionRoute permission="read:subject"><SubjectsPage /></PermissionRoute>} />
                                        <Route path="/courses" element={<PermissionRoute permission="read:course"><CoursesPage /></PermissionRoute>} />
                                        <Route path="/courses/:id" element={<PermissionRoute permission="read:course"><CourseDetailPage /></PermissionRoute>} />
                                        <Route path="/teacher-groups" element={<PermissionRoute permission="read:group"><TeacherGroupsPage /></PermissionRoute>} />
                                        <Route path="/teacher-subjects" element={<PermissionRoute permission="read:subject"><TeacherSubjectsPage /></PermissionRoute>} />
                                        <Route path="/questions" element={<PermissionRoute permission="read:question"><QuestionsPage /></PermissionRoute>} />
                                        <Route path="/questions/create" element={<PermissionRoute permission="create:question"><QuestionFormPage /></PermissionRoute>} />
                                        <Route path="/questions/:id/edit" element={<PermissionRoute permission="update:question"><QuestionFormPage /></PermissionRoute>} />
                                        <Route path="/quizzes" element={<PermissionRoute permission="read:quiz"><QuizzesPage /></PermissionRoute>} />
                                        <Route path="/quizzes/:id" element={<PermissionRoute permission="read:result"><QuizDetailPage /></PermissionRoute>} />
                                        <Route path="/active-quizzes" element={<PermissionRoute permission="read:active_quiz"><ActiveQuizzesPage /></PermissionRoute>} />

                                        <Route path="/results" element={<PermissionRoute permission="read:result"><ResultsPage /></PermissionRoute>} />
                                        <Route path="/results/answers" element={<PermissionRoute permission="user_answers:read"><UserAnswersPage /></PermissionRoute>} />
                                    </Route>
                                </Route>

                                <Route path="*" element={<NotFoundPage />} />
                            </Routes>
                        </Suspense>
                    </Router>
                    <Toaster />
                </AuthProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}

export default App;
