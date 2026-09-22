import { AccessDenied } from '@/components/auth/AccessDenied';
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import MainLayout from '@/components/layout/MainLayout';
import FocusLayout from '@/components/layout/FocusLayout';
import { Toaster } from '@/components/ui/Toaster';

import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useRoleView } from '@/hooks/useRoleView';
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
const SpecialitiesPage = lazy(() => import('@/pages/SpecialitiesPage'));
const CurriculumsPage = lazy(() => import('@/pages/CurriculumsPage'));
const FilesPage = lazy(() => import('@/pages/FilesPage'));
const AnnouncementsPage = lazy(() => import('@/pages/AnnouncementsPage'));
const StudentAnnouncementsPage = lazy(() => import('@/pages/StudentAnnouncementsPage'));
const TeacherAssignmentsPage = lazy(() => import('@/pages/TeacherAssignmentsPage'));
const GroupsPage = lazy(() => import('@/pages/GroupsPage'));
const GroupStudentsPage = lazy(() => import('@/pages/GroupStudentsPage'));
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
// Reyting vaqtincha yashirilgan — marshrut va menyu yozuvi bilan birga
// (sabab: `constants/resources.ts`). Import ham o'chirilgan, aks holda
// sahifa ishlatilmasa ham bundle'ga kirib qolardi.
// const TeacherRankingPage = lazy(() => import('@/pages/TeacherRankingPage'));
const PsychologyPage = lazy(() => import('@/pages/PsychologyPage'));
const PsychologyTestPage = lazy(() => import('@/pages/PsychologyTestPage'));
const PsychologyResultsPage = lazy(() => import('@/pages/PsychologyResultsPage'));
const StudentPsychologyPage = lazy(() => import('@/pages/StudentPsychologyPage'));
const LessonsPage = lazy(() => import('@/pages/LessonsPage'));
const LessonDetailPage = lazy(() => import('@/pages/LessonDetailPage'));
const PublicQuizPage = lazy(() => import('@/pages/PublicQuizPage'));
const HomeworksPage = lazy(() => import('@/pages/HomeworksPage'));
const HomeworkSubmissionsPage = lazy(() => import('@/pages/HomeworkSubmissionsPage'));
const RolesPage = lazy(() => import('@/pages/RolesPage'));
const RolePermissionsPage = lazy(() => import('@/pages/RolePermissionsPage'));
const PermissionsPage = lazy(() => import('@/pages/PermissionsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const PageSpinner = () => (
    <div className="flex h-dvh items-center justify-center animate-fade-scale">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent shadow-sm" />
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
        // Bosh sahifaga jim otib yuborish chalkash edi: oʻqituvchi uchun bosh
        // sahifa /questions, shuning uchun natijadagi «Koʻrish» tugmasi
        // buzilgandek tuyulardi. Endi sabab aytiladi.
        return <AccessDenied required={required} />;
    }
    return children;
};

/**
 * Faqat admin koʻrinishidagi boʻlim.
 *
 * Ruxsat bu yerda hal qilmaydi: masalan `read:teacher_assignment`
 * oʻqituvchida ham boʻlishi mumkin (bekend unga oʻz yuklamasinigina
 * beradi), lekin boʻlimning oʻzi maʼmuriy. Menyudan olib tashlashning oʻzi
 * toʻgʻridan-toʻgʻri havolani toʻsmaydi — shuning uchun marshrut ham
 * yopiladi.
 */
const AdminRoute = ({ children }: { children: React.ReactElement }) => {
    const { isLoading } = useAuth();
    const { isAdmin } = useRoleView();

    if (isLoading) {
        return <PageSpinner />;
    }

    if (!isAdmin) {
        return <AccessDenied reason="Boʻlim faqat administrator koʻrinishida ochiladi" />;
    }
    return children;
};

/**
 * Oʻqituvchi koʻrinishida yopiladigan boʻlim.
 *
 * Ruxsat bu yerda hal qilmaydi: `read:psychology`, `read:teacher` va
 * tashkiliy tuzilma ruxsatlari baʼzi oʻqituvchilarda baribir bor (qoʻlda
 * berilgan yoki eski migratsiyadan qolgan). Menyudan olib tashlash
 * (`constants/resources.ts` dagi TEACHER_HIDDEN_RESOURCES) toʻgʻridan-toʻgʻri
 * havolani toʻsmaydi — shuning uchun marshrut ham yopiladi.
 *
 * Rollar `buildSidebar` dagi `isTeacherOnly` bilan bir xil sanaladi: admin
 * yoki psixolog roli aralashgan boʻlsa boʻlim ochiq qoladi, aks holda menyu
 * va marshrut bir-biriga zid javob berardi.
 */
const TeacherBlockedRoute = ({
    reason,
    children,
}: {
    reason: string;
    children: React.ReactElement;
}) => {
    const { isLoading } = useAuth();
    const { isTeacherOnly } = useRoleView();

    if (isLoading) {
        return <PageSpinner />;
    }

    if (isTeacherOnly) {
        return <AccessDenied reason={reason} />;
    }
    return children;
};

/**
 * «Fayllar kutubxonasi» — talaba koʻrinishida yopiq.
 *
 * Talaba faylni faqat oʻz qurilmasidan yuklaydi (uy vazifasi javobida).
 * `read:file` unga berilmagan, lekin Rollar oynasidan qoʻlda berilishi
 * mumkin — shuning uchun marshrut ham yopiladi. Bekend ham shu chegarani
 * qoʻyadi (`FileLibraryExceptStudent`); oʻqituvchi roli ham bor hisob
 * bundan tashqarida.
 */
const FileLibraryRoute = ({ children }: { children: React.ReactElement }) => {
    const { isLoading } = useAuth();
    const { isStudent, isTeacher } = useRoleView();

    if (isLoading) {
        return <PageSpinner />;
    }

    if (isStudent && !isTeacher) {
        return <AccessDenied reason="Talaba faylni faqat oʻz qurilmasidan yuklaydi" />;
    }
    return children;
};

/**
 * Psixologiya boʻlimi — psixolog xizmatining ishi (`psixologik` roli).
 *
 * Talabaning oʻz sahifasi (`/psychology/student`) bunga kirmaydi.
 */
const PsychologyRoute = ({ children }: { children: React.ReactElement }) => (
    <TeacherBlockedRoute reason="Boʻlim psixolog xizmati uchun">{children}</TeacherBlockedRoute>
);

/**
 * Oʻqituvchilar maʼlumotnomasi — maʼmuriyat ishi.
 *
 * Roʻyxatda butun universitetning professor-oʻqituvchilari: kafedrasi,
 * biriktirilgan fanlari va guruhlari bilan. Oʻqituvchiga hamkasblarining
 * roʻyxati kerak emas, oʻzining maʼlumotlari esa Profil sahifasida.
 */
const TeacherDirectoryRoute = ({ children }: { children: React.ReactElement }) => (
    <TeacherBlockedRoute reason="Boʻlim maʼmuriyat uchun: oʻz maʼlumotlaringiz Profil sahifasida">
        {children}
    </TeacherBlockedRoute>
);

/**
 * Tashkiliy tuzilma — fakultet, kafedra, mutaxassislik va oʻquv reja.
 *
 * Maʼlumotnomani EPOS/HEMIS toʻldiradi, platformada faqat oʻqiladi va u
 * maʼmuriyatning ishi. Oʻqituvchiga butun universitetning boʻlinmalari
 * kerak emas: guruhlari, kurslari va darslari oʻz boʻlimlarida. Bekend ham
 * shu chegarani qoʻyadi (`PermissionRequiredExceptTeacher`) — bu yerdagisi
 * 403 oʻrniga sababni koʻrsatish uchun.
 */
const OrganizationStructureRoute = ({ children }: { children: React.ReactElement }) => (
    <TeacherBlockedRoute reason="Boʻlim maʼmuriyat uchun: oʻz guruhlaringiz «Guruhlar» boʻlimida">
        {children}
    </TeacherBlockedRoute>
);

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

                                {/* Ochiq test: tizimga kirmasdan, PIN orqali. */}
                                <Route path="/t" element={<PublicQuizPage />} />
                                <Route path="/t/:pin" element={<PublicQuizPage />} />

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
                                        <Route path="/teachers" element={<TeacherDirectoryRoute><PermissionRoute permission="read:teacher"><TeachersPage /></PermissionRoute></TeacherDirectoryRoute>} />
                                        {/* «Reyting» vaqtincha o'chirilgan (2026-09-16): natijalar
                                            o'qituvchiga faqat guruh bo'yicha bog'lanadi, fan hisobga
                                            olinmaydi — bitta natija guruhdagi barcha o'qituvchilarga
                                            tushadi. Sabab va qaytarish tartibi `constants/resources.ts`
                                            da. Marshrut ham yopilgan: menyudan olib tashlashning o'zi
                                            to'g'ridan-to'g'ri havolani to'smaydi.
                                        <Route path="/teacher-ranking" element={<PermissionRoute permission="read:teacher"><TeacherRankingPage /></PermissionRoute>} /> */}

                                        <Route path="/faculties/*" element={<OrganizationStructureRoute><PermissionRoute permission="read:faculty"><FacultyPage /></PermissionRoute></OrganizationStructureRoute>} />
                                        <Route path="/faculties" element={<OrganizationStructureRoute><PermissionRoute permission="read:faculty"><FacultyPage /></PermissionRoute></OrganizationStructureRoute>} />
                                        <Route path="/kafedras" element={<OrganizationStructureRoute><PermissionRoute permission="read:kafedra"><KafedraPage /></PermissionRoute></OrganizationStructureRoute>} />
                                        <Route path="/teacher-assignments" element={<AdminRoute><PermissionRoute permission="read:teacher_assignment"><TeacherAssignmentsPage /></PermissionRoute></AdminRoute>} />
                                        <Route path="/files" element={<FileLibraryRoute><PermissionRoute permission="read:file"><FilesPage /></PermissionRoute></FileLibraryRoute>} />
                                        {/* Boshqaruv ro'yxati va talaba lentasi alohida huquqda:
                                            talabaga `read:announcement` berilsa, unga tahrirlash
                                            sahifasi ham ochilib ketardi. */}
                                        <Route path="/announcements" element={<PermissionRoute permission="read:announcement"><AnnouncementsPage /></PermissionRoute>} />
                                        <Route path="/announcements/student" element={<PermissionRoute permission="announcement:feed"><StudentAnnouncementsPage /></PermissionRoute>} />
                                        <Route path="/specialities" element={<OrganizationStructureRoute><PermissionRoute permission={['read:speciality', 'read:faculty']}><SpecialitiesPage /></PermissionRoute></OrganizationStructureRoute>} />
                                        <Route path="/curriculums" element={<OrganizationStructureRoute><PermissionRoute permission="read:curriculum"><CurriculumsPage /></PermissionRoute></OrganizationStructureRoute>} />
                                        <Route path="/groups" element={<PermissionRoute permission="read:group"><GroupsPage /></PermissionRoute>} />
                                        {/* `read:group` yetarli: backend o'qituvchiga faqat o'z guruhini ochadi. */}
                                        <Route path="/groups/:groupId/students" element={<PermissionRoute permission="read:group"><GroupStudentsPage /></PermissionRoute>} />
                                        <Route path="/students" element={<PermissionRoute permission="read:student"><StudentsPage /></PermissionRoute>} />
                                        <Route path="/admin/hemis-sync" element={<PermissionRoute permission="hemis_admin_sync"><HemisSyncPage /></PermissionRoute>} />
                                        <Route path="/admin/eduplan-sync" element={<PermissionRoute permission="sync:eduplan"><EduPlanSyncPage /></PermissionRoute>} />

                                        <Route path="/lessons" element={<PermissionRoute permission="read:lesson"><LessonsPage /></PermissionRoute>} />
                                        <Route path="/lessons/:id" element={<PermissionRoute permission="read:lesson"><LessonDetailPage /></PermissionRoute>} />
                                        <Route path="/homework" element={<PermissionRoute permission="read:homework"><HomeworksPage /></PermissionRoute>} />
                                        {/* Ishlarni tekshirish — `update:submission` faqat o'qituvchi/adminda:
                                            talabada `read:submission` bor, lekin bu sahifa unga emas. */}
                                        <Route path="/homework/:id/submissions" element={<PermissionRoute permission="update:submission"><HomeworkSubmissionsPage /></PermissionRoute>} />
                                        <Route path="/psychology" element={<PsychologyRoute><PermissionRoute permission="read:psychology"><PsychologyPage /></PermissionRoute></PsychologyRoute>} />
                                        <Route path="/psychology/results" element={<PsychologyRoute><PermissionRoute permission="read:psychology_results"><PsychologyResultsPage /></PermissionRoute></PsychologyRoute>} />
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
