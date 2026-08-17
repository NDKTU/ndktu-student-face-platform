import { Database, Lock } from 'lucide-react';

/** Признаки строки-зеркала, приходящие в любом ответе справочника. */
export interface ExternalRefFields {
    external_source?: string | null;
    synced_at?: string | null;
    is_active?: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
    eduplan: 'EduPlan',
    hemis: 'HEMIS',
};

/** Строкой владеет внешняя система — редактировать её нельзя. */
export const isExternal = (row?: ExternalRefFields | null): boolean =>
    Boolean(row?.external_source);

/**
 * Метка источника рядом с названием записи.
 *
 * Нужна, чтобы администратор понимал, почему кнопки редактирования недоступны:
 * бэкенд такие правки отклоняет, и молчаливо отключённая кнопка выглядела бы
 * поломкой.
 */
export const ExternalSourceBadge = ({ row }: { row?: ExternalRefFields | null }) => {
    if (!isExternal(row)) return null;

    const label = SOURCE_LABEL[row!.external_source!] ?? row!.external_source!;
    const synced = row?.synced_at
        ? new Date(row.synced_at).toLocaleString('ru-RU')
        : null;

    return (
        <span
            className="inline-flex items-center gap-1 rounded-full bg-[#242CBB]/10 px-2 py-0.5 text-xs text-[#242CBB]"
            title={synced ? `Синхронизировано: ${synced}` : `Источник: ${label}`}
        >
            <Database className="h-3 w-3" />
            {label}
            <Lock className="h-3 w-3" />
        </span>
    );
};

/** Неактивная запись: пропала во внешней системе, но не удалена у нас. */
export const InactiveBadge = ({ row }: { row?: ExternalRefFields | null }) => {
    if (row?.is_active !== false) return null;
    return (
        <span
            className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            title="Запись отсутствует во внешней системе. Не удалена — на ней могут висеть результаты."
        >
            неактивна
        </span>
    );
};
