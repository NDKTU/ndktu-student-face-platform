import { useQuery } from '@tanstack/react-query';
import { auditService, type AuditListParams } from '@/services/auditService';

export const useAuditLogs = (params: AuditListParams = {}, enabled = true) =>
    useQuery({
        queryKey: ['audit', params],
        queryFn: () => auditService.list(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });

/**
 * Filtr uchun hodisalar ro'yxati. Bazada uchraydiganlari qaytadi, shuning
 * uchun uzoq keshlanadi: yangi hodisa turi kuniga bir marta ham
 * qo'shilmaydi.
 */
export const useAuditEvents = (enabled = true) =>
    useQuery({
        queryKey: ['audit', 'events'],
        queryFn: () => auditService.events(),
        staleTime: 10 * 60 * 1000,
        enabled,
    });
