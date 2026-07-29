import React from 'react';
import { useAuth } from '@/context/AuthContext';

interface PermissionGateProps {
    permission: string | string[];
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
    permission,
    fallback = null,
    children,
}) => {
    const { hasPermission, hasAnyPermission } = useAuth();
    const allowed = Array.isArray(permission)
        ? hasAnyPermission(...permission)
        : hasPermission(permission);
    return <>{allowed ? children : fallback}</>;
};

export const usePermission = (name: string): boolean => {
    const { hasPermission } = useAuth();
    return hasPermission(name);
};

export default PermissionGate;
