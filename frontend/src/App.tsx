import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import Login from '@/pages/Login';
import MainLayout from '@/components/layout/MainLayout';
import Dashboard from '@/pages/Dashboard';
import ProfilePage from '@/pages/ProfilePage';
import UsersPage from '@/pages/UsersPage';
import QuizzesPage from '@/pages/QuizzesPage';
import ActiveQuizzesPage from '@/pages/ActiveQuizzesPage';
import ResultsPage from '@/pages/ResultsPage';
import TeachersPage from '@/pages/TeachersPage';
import EmployeesPage from '@/pages/EmployeesPage';
import HemisSyncPage from '@/pages/HemisSyncPage';
import FacultyPage from '@/pages/FacultyPage';
import KafedraPage from '@/pages/KafedraPage';
import GroupsPage from '@/pages/GroupsPage';
import SubjectsPage from '@/pages/SubjectsPage';
import StudentsPage from '@/pages/StudentsPage';
import QuestionsPage from '@/pages/QuestionsPage';
import QuestionFormPage from '@/pages/QuestionFormPage';
import QuizTestPage from '@/pages/QuizTestPage';
import UserAnswersPage from '@/pages/UserAnswersPage';
import TeacherGroupsPage from '@/pages/TeacherGroupsPage';
import TeacherSubjectsPage from '@/pages/TeacherSubjectsPage';
import TeacherRankingPage from '@/pages/TeacherRankingPage';
import StatisticsPage from '@/pages/StatisticsPage';
import YakuniyPage from '@/pages/YakuniyPage';
import PsychologyPage from '@/pages/PsychologyPage';
import PsychologyTestPage from '@/pages/PsychologyTestPage';
import PsychologyResultsPage from '@/pages/PsychologyResultsPage';
import StudentPsychologyPage from '@/pages/StudentPsychologyPage';
import LessonsPage from '@/pages/LessonsPage';
import LessonDetailPage from '@/pages/LessonDetailPage';
import AcademicYearsPage from '@/pages/AcademicYearsPage';
import RolesPage from '@/pages/RolesPage';
import RolePermissionsPage from '@/pages/RolePermissionsPage';
import PermissionsPage from '@/pages/PermissionsPage';


import { useIdleTimeout } from '@/hooks/useIdleTimeout';

const ProtectedRoute = () => {
  useIdleTimeout();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const PermissionRoute = ({ permission, children }: { permission: string | string[]; children: React.ReactElement }) => {
  const { hasAnyPermission, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const required = Array.isArray(permission) ? permission : [permission];
  if (!hasAnyPermission(...required)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const StudentRoute = ({ children }: { children: React.ReactElement }) => {
  const { user } = useAuth();
  const isStudent = (user?.roles ?? []).some((r) => r.name.toLowerCase() === 'student');
  if (!isStudent) return <Navigate to="/" replace />;
  return children;
};

const DashboardRedirect = () => {
  const { user } = useAuth();
  const isStudent = user?.roles?.some(role => role.name.toLowerCase() === 'student');
  const isTeacher = user?.roles?.some(role => role.name.toLowerCase() === 'teacher');
  const isPsixologik = user?.roles?.some(role => role.name.toLowerCase() === 'psixologik');

  if (isPsixologik) {
    return <Navigate to="/psychology" replace />;
  }

  if (isStudent) {
    return <Navigate to="/quiz-test" replace />;
  }

  if (isTeacher) {
    return <Navigate to="/questions" replace />;
  }

  return <Dashboard />;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout />}>
                <Route path="/" element={<DashboardRedirect />} />
                <Route path="/profile" element={<ProfilePage />} />

                <Route path="/dashboard" element={<PermissionRoute permission="read:statistics"><Dashboard /></PermissionRoute>} />
                <Route path="/users" element={<PermissionRoute permission="read:user"><UsersPage /></PermissionRoute>} />
                <Route path="/roles" element={<PermissionRoute permission="read:role"><RolesPage /></PermissionRoute>} />
                <Route path="/roles/:id/permissions" element={<PermissionRoute permission="read:role"><RolePermissionsPage /></PermissionRoute>} />
                <Route path="/permissions" element={<PermissionRoute permission="read:permission"><PermissionsPage /></PermissionRoute>} />
                <Route path="/teachers" element={<PermissionRoute permission="read:teacher"><TeachersPage /></PermissionRoute>} />
                <Route path="/employees" element={<PermissionRoute permission="read:employee"><EmployeesPage /></PermissionRoute>} />
                <Route path="/teacher-ranking" element={<PermissionRoute permission={['read:statistics', 'read:teacher']}><TeacherRankingPage /></PermissionRoute>} />
                <Route path="/statistics" element={<PermissionRoute permission="read:statistics"><StatisticsPage /></PermissionRoute>} />

                <Route path="/faculties" element={<PermissionRoute permission="read:faculty"><FacultyPage /></PermissionRoute>} />
                <Route path="/kafedras" element={<PermissionRoute permission="read:kafedra"><KafedraPage /></PermissionRoute>} />
                <Route path="/groups" element={<PermissionRoute permission="read:group"><GroupsPage /></PermissionRoute>} />
                <Route path="/students" element={<PermissionRoute permission="read:student"><StudentsPage /></PermissionRoute>} />
                <Route path="/admin/hemis-sync" element={<PermissionRoute permission="hemis_admin_sync"><HemisSyncPage /></PermissionRoute>} />
                <Route path="/yakuniy" element={<PermissionRoute permission="read:yakuniy"><YakuniyPage /></PermissionRoute>} />

                <Route path="/lessons" element={<PermissionRoute permission="read:lesson"><LessonsPage /></PermissionRoute>} />
                <Route path="/lessons/:id" element={<PermissionRoute permission="read:lesson"><LessonDetailPage /></PermissionRoute>} />
                <Route path="/psychology" element={<PermissionRoute permission="read:psychology"><PsychologyPage /></PermissionRoute>} />
                <Route path="/psychology/test/:methodId" element={<PermissionRoute permission="read:psychology"><PsychologyTestPage /></PermissionRoute>} />
                <Route path="/psychology/results" element={<PermissionRoute permission="read:psychology_results"><PsychologyResultsPage /></PermissionRoute>} />
                <Route path="/psychology/student" element={<StudentRoute><StudentPsychologyPage /></StudentRoute>} />

                <Route path="/academic-years" element={<PermissionRoute permission="read:academic_year"><AcademicYearsPage /></PermissionRoute>} />

                <Route path="/subjects" element={<PermissionRoute permission="read:subject"><SubjectsPage /></PermissionRoute>} />
                <Route path="/teacher-groups" element={<PermissionRoute permission="read:group"><TeacherGroupsPage /></PermissionRoute>} />
                <Route path="/teacher-subjects" element={<PermissionRoute permission="read:subject"><TeacherSubjectsPage /></PermissionRoute>} />
                <Route path="/questions" element={<PermissionRoute permission="read:question"><QuestionsPage /></PermissionRoute>} />
                <Route path="/questions/create" element={<PermissionRoute permission="create:question"><QuestionFormPage /></PermissionRoute>} />
                <Route path="/questions/:id/edit" element={<PermissionRoute permission="update:question"><QuestionFormPage /></PermissionRoute>} />
                <Route path="/quizzes" element={<PermissionRoute permission="read:quiz"><QuizzesPage /></PermissionRoute>} />
                <Route path="/active-quizzes" element={<PermissionRoute permission="read:active_quiz"><ActiveQuizzesPage /></PermissionRoute>} />

                <Route path="/quiz-test" element={<PermissionRoute permission="quiz_process:start_quiz"><QuizTestPage /></PermissionRoute>} />
                <Route path="/results" element={<PermissionRoute permission="read:result"><ResultsPage /></PermissionRoute>} />
                <Route path="/results/answers" element={<PermissionRoute permission="user_answers:read"><UserAnswersPage /></PermissionRoute>} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
