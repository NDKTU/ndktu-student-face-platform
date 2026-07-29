import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/login/LoginPage';
import { RequireAccess } from '@/entities/access/ui/RequireAccess';
import type { NavKey } from '@/entities/access/model/roles';
import { useSessionStore } from '@/features/auth/model/session.store';
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
  const loggedIn = useSessionStore((s) => s.loggedIn);

  return (
    <BrowserRouter>
      {loggedIn ? <AuthenticatedRoutes /> : <LoginPage />}
      <Toast />
    </BrowserRouter>
  );
}

/**
 * Bosh sahifa зависит от роли: у преподавателя и студента — своя домашняя,
 * у управляющих ролей — административный дашборд.
 */
function AuthenticatedRoutes() {
  const role = useSessionStore((s) => s.role);
  const home =
    role === 'talaba' ? <StudentHome /> : role === 'oqituvchi' ? <TeacherHome /> : <DashboardPage />;
  // Testlar: у преподавателя — свои тесты + создание; у управляющих ролей —
  // список всех тестов с аналитикой (буилдтестдетейл).
  const testlar = role === 'oqituvchi' ? <TeacherTestlarPage /> : <AdminTestlarPage />;

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
