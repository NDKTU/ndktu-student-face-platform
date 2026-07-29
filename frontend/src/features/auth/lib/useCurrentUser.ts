import { useMemo } from 'react';
import { roleColor, roleLabel } from '@/entities/access/model/roles';
import { initials } from '@/shared/lib/initials';
import { useSessionStore } from '../model/session.store';

export interface CurrentUser {
  /** Как подписывать пользователя в шапке и на карточках. */
  displayName: string;
  /** Логин — им он входит; ФИО может совпадать у однофамильцев, логин нет. */
  username: string;
  /** Подпись роли под именем. Ролей может быть несколько — берём первую. */
  roleLabel: string;
  roleColor: string;
  initials: string;
  /** Аватар: у сотрудника и студента поле называется по-разному. */
  avatarUrl: string | null;
}

/**
 * Всё, что нужно интерфейсу о владельце токена, — из `/user/me` и только оттуда.
 * Раньше на этом месте был захардкоженный список демо-персон.
 */
export function useCurrentUser(): CurrentUser {
  const user = useSessionStore((s) => s.user);
  const roleNames = useSessionStore((s) => s.roleNames);

  return useMemo(() => {
    // ФИО есть в анкете; если её нет (учётка без сотрудника и студента) —
    // остаётся логин, и это лучше, чем пустая строка под аватаром.
    const displayName = user?.employee?.full_name ?? user?.student?.full_name ?? user?.username ?? '';
    const primaryRole = roleNames[0] ?? '';

    return {
      displayName,
      username: user?.username ?? '',
      roleLabel: primaryRole ? roleLabel(primaryRole) : '',
      roleColor: roleColor(primaryRole),
      initials: initials(displayName),
      avatarUrl: user?.employee?.image_url ?? user?.student?.image_path ?? null,
    };
  }, [user, roleNames]);
}
