import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/login/LoginPage';
import { RequireAccess } from '@/entities/access/ui/RequireAccess';
import { usePermissions } from '@/entities/access/lib/usePermissions';
import type { NavKey } from '@/entities/access/model/roles';
import { useSessionStore } from '@/features/auth/model/session.store';
import { useSessionSync } from '@/features/auth/lib/useSessionSync';
import { Toast } from '@/shared/ui/Toast';
import { AppLayout } from '@/widgets/layout/AppLayout';
import { TuzilmaPage } from '@/pages/tuzilma/TuzilmaPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ProfilPage } from '@/pages/profil/ProfilPage';
import { FanlarPage } from '@/pages/fanlar/FanlarPage';
import { RejaPage } from '@/pages/reja/RejaPage';
import { FoydalanuvchilarPage } from '@/pages/foydalanuvchilar/FoydalanuvchilarPage';
import { RollarPage } from '@/pages/rollar/RollarPage';
import { SavollarPage } from '@/pages/savollar/SavollarPage';
import { KurslarPage } from '@/pages/kurslar/KurslarPage';
import { ReytingPage } from '@/pages/reyting/ReytingPage';
import { StudentTestlarPage } from '@/pages/testlar/StudentTestlarPage';
import { TeacherTestlarPage } from '@/pages/testlar/TeacherTestlarPage';
import { AdminTestlarPage } from '@/pages/testlar/AdminTestlarPage';
import { StudentVazifalarPage } from '@/pages/vazifalar/StudentVazifalarPage';
import { TeacherVazifalarPage } from '@/pages/vazifalar/TeacherVazifalarPage';
import { AdminVazifalarPage } from '@/pages/vazifalar/AdminVazifalarPage';
import { SozlamalarPage } from '@/pages/sozlamalar/SozlamalarPage';
import { StudentHome } from '@/pages/home/StudentHome';
import { TeacherHome } from '@/pages/home/TeacherHome';
import { PlaceholderPage } from '@/pages/placeholder/PlaceholderPage';

export function App() {
  const status = useSessionStore((s) => s.status);
  const bootstrap = useSessionStore((s) => s.bootstrap);

  useSessionSync();

  // Токен лежит в localStorage, а кто им владеет — знает только сервер.
  // Пока `/user/me` не ответил, показывать нечего: и приложение, и экран
  // входа были бы одинаково неверны.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      {status === 'unknown' ? (
        <Splash />
      ) : status === 'authenticated' ? (
        <AuthenticatedRoutes />
      ) : (
        <LoginPage />
      )}
      <Toast />
    </BrowserRouter>
  );
}

function Splash() {
  return (
    <div className="grid h-screen place-items-center bg-canvas">
      <span className="size-8 animate-spin-slow rounded-full border-[3px] border-line border-t-brand" />
    </div>
  );
}

/**
 * Bosh sahifa зависит от того, кто вошёл: у студента и преподавателя — своя
 * домашняя, у управляющих ролей — административный дашборд.
 */
function AuthenticatedRoutes() {
  const { persona } = usePermissions();
  // Преподаватель — это запись в `teachers`, а не право или название роли.
  // У администратора право `create:quiz` тоже есть, но домашняя страница
  // преподавателя ему нечем наполниться: ни своих предметов, ни своих групп.
  const isTeacher = useSessionStore((s) => s.user?.employee?.teacher != null);

  const home =
    persona === 'student' ? <StudentHome /> : isTeacher ? <TeacherHome /> : <DashboardPage />;

  // Testlar: преподаватель ведёт свои тесты и конструктор, управляющие роли —
  // общий список с аналитикой.
  const testlar = isTeacher ? <TeacherTestlarPage /> : <AdminTestlarPage />;

  // Раздел -> путь -> страница. Гард навешивается на все разом, чтобы новый
  // раздел нельзя было добавить, забыв про проверку доступа.
  const guarded: [NavKey, string, () => ReactNode][] = [
    ['tuzilma', '/tuzilma/*', () => <TuzilmaPage />],
    ['fanlar', '/fanlar', () => <FanlarPage />],
    ['reja', '/reja', () => <RejaPage />],
    ['foydalanuvchilar', '/foydalanuvchilar', () => <FoydalanuvchilarPage />],
    ['rollar', '/rollar', () => <RollarPage />],
    ['savollar', '/savollar', () => <SavollarPage />],
    ['kurslar', '/kurslar', () => <KurslarPage />],
    ['reyting', '/reyting', () => <ReytingPage />],
    ['testlar', '/testlar', () => testlar],
    ['stestlar', '/stestlar', () => <StudentTestlarPage />],
    ['svazlar', '/svazlar', () => <StudentVazifalarPage />],
    ['tvazlar', '/tvazlar', () => <TeacherVazifalarPage />],
    ['avazlar', '/avazlar', () => <AdminVazifalarPage />],
    ['sozlamalar', '/sozlamalar', () => <SozlamalarPage />],
    ['profil', '/profil', () => <ProfilPage />],
  ];

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/bosh" element={home} />
        {guarded.map(([nav, path, render]) => (
          <Route
            key={path}
            path={path}
            element={<RequireAccess nav={nav}>{render()}</RequireAccess>}
          />
        ))}
        <Route path="/:nav" element={<PlaceholderPage />} />
        <Route path="*" element={<Navigate to="/bosh" replace />} />
      </Route>
    </Routes>
  );
}
