import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { ArrowLeft, Loader2, Save, ShieldAlert } from 'lucide-react';
import { roleService } from '@/services/roleService';
import { permissionService, type Permission } from '@/services/permissionService';
import { useAssignPermissions } from '@/hooks/useReferenceData';
import { logger } from '@/utils/logger';
import {
    RESOURCES,
    ACTIONS,
    ACTION_LABELS,
    labelFor,
    parsePermission,
    type Action,
} from '@/constants/resources';
import { useAuth } from '@/context/AuthContext';

interface PermissionMap {
    // resource -> action -> Permission
    [resource: string]: Partial<Record<string, Permission>>;
}

const RolePermissionsPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { refreshMe } = useAuth();
    const roleId = Number(id);

    const roleQuery = useQuery({
        queryKey: ['role', roleId],
        queryFn: () => roleService.getRoleById(roleId),
        enabled: !!roleId,
    });

    const permsQuery = useQuery({
        queryKey: ['all-permissions'],
        queryFn: () => permissionService.getPermissions(1, 1000),
    });

    const assignPermissions = useAssignPermissions();

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (roleQuery.data) {
            setSelectedIds(new Set((roleQuery.data.permissions ?? []).map((p) => p.id)));
            setHasChanges(false);
        }
    }, [roleQuery.data]);

    const role = roleQuery.data;
    const allPermissions = permsQuery.data?.permissions ?? [];
    const isAdminRole = role?.name?.toLowerCase() === 'admin';

    // resource -> action -> Permission
    const permMap: PermissionMap = useMemo(() => {
        const map: PermissionMap = {};
        for (const p of allPermissions) {
            const { action, resource } = parsePermission(p.name);
            (map[resource] ??= {})[action] = p;
        }
        return map;
    }, [allPermissions]);

    // Resources with at least one page (have href in RESOURCES)
    const pageResources = useMemo(
        () =>
            Object.keys(permMap)
                .filter((r) => RESOURCES[r]?.href)
                .sort((a, b) => labelFor(a).localeCompare(labelFor(b))),
        [permMap]
    );

    const otherResources = useMemo(
        () =>
            Object.keys(permMap)
                .filter((r) => !RESOURCES[r]?.href)
                .sort((a, b) => labelFor(a).localeCompare(labelFor(b))),
        [permMap]
    );

    const togglePermission = (perm: Permission | undefined, value: boolean) => {
        if (!perm || isAdminRole) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (value) next.add(perm.id);
            else next.delete(perm.id);
            return next;
        });
        setHasChanges(true);
    };

    const toggleResourceVisibility = (resource: string, value: boolean) => {
        if (isAdminRole) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const actions = permMap[resource] ?? {};
            if (value) {
                // turning on => grant read; do not auto-grant CRUD
                if (actions.read) next.add(actions.read.id);
            } else {
                // turning off => revoke all CRUD for this resource
                for (const action of Object.values(actions)) {
                    if (action) next.delete(action.id);
                }
            }
            return next;
        });
        setHasChanges(true);
    };

    const isReadOn = (resource: string) => {
        const readPerm = permMap[resource]?.read;
        return readPerm ? selectedIds.has(readPerm.id) : false;
    };

    const handleSave = async () => {
        if (!role) return;
        try {
            await assignPermissions.mutateAsync({
                role_id: role.id,
                permission_ids: Array.from(selectedIds),
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['roles'] }),
                queryClient.invalidateQueries({ queryKey: ['role', role.id] }),
            ]);
            // Refresh current user's permissions in case admin edited their own role
            await refreshMe();
            setHasChanges(false);
        } catch (error) {
            logger.error('Failed to save permissions', error);
            alert("Saqlashda xatolik yuz berdi");
        }
    };

    const handleReset = () => {
        if (role) {
            setSelectedIds(new Set((role.permissions ?? []).map((p) => p.id)));
            setHasChanges(false);
        }
    };

    if (roleQuery.isLoading || permsQuery.isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!role) {
        return (
            <div className="space-y-6">
                <Button variant="ghost" onClick={() => navigate('/roles')}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Orqaga
                </Button>
                <div>Rol topilmadi.</div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => navigate('/roles')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Orqaga
                </Button>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{role.name} ruxsatlari</h1>
                    <p className="text-sm text-muted-foreground">Sahifa va amallar tanlash</p>
                </div>
            </div>

            {isAdminRole && (
                <Card className="border-amber-500/40 bg-amber-500/10">
                    <CardContent className="pt-6 flex items-start gap-3">
                        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <div className="font-semibold text-amber-700">Admin rolini tahrirlab bo'lmaydi</div>
                            <div className="text-muted-foreground">Admin barcha ruxsatlarga ega va o'zgartirilmaydi.</div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {pageResources.map((resource) => {
                    const meta = RESOURCES[resource];
                    const Icon = meta?.icon;
                    const actions = permMap[resource] ?? {};
                    const readOn = isReadOn(resource);

                    return (
                        <Card key={resource}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center justify-between text-base">
                                    <span className="flex items-center gap-2">
                                        {Icon && <Icon className="h-4 w-4" />}
                                        {labelFor(resource)}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Sahifa ko'rinadi</span>
                                        <Switch
                                            checked={readOn}
                                            disabled={isAdminRole || !actions.read}
                                            onCheckedChange={(v) => toggleResourceVisibility(resource, v)}
                                        />
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="grid grid-cols-2 gap-2">
                                    {ACTIONS.filter((a) => a !== 'read').map((action: Action) => {
                                        const perm = actions[action];
                                        if (!perm) return null;
                                        const checked = selectedIds.has(perm.id);
                                        return (
                                            <label
                                                key={action}
                                                className={`flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm ${
                                                    !readOn || isAdminRole ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/30'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                    checked={checked}
                                                    disabled={!readOn || isAdminRole}
                                                    onChange={(e) => togglePermission(perm, e.target.checked)}
                                                />
                                                <span>{ACTION_LABELS[action]}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {otherResources.length > 0 && (
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70 mb-3">Boshqa ruxsatlar</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        {otherResources.map((resource) => {
                            const actions = permMap[resource] ?? {};
                            return (
                                <Card key={resource}>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">{labelFor(resource)}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="grid grid-cols-2 gap-2">
                                            {Object.entries(actions).map(([action, perm]) => {
                                                if (!perm) return null;
                                                const checked = selectedIds.has(perm.id);
                                                return (
                                                    <label
                                                        key={action}
                                                        className={`flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm ${
                                                            isAdminRole ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/30'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                            checked={checked}
                                                            disabled={isAdminRole}
                                                            onChange={(e) => togglePermission(perm, e.target.checked)}
                                                        />
                                                        <span className="font-mono text-xs">{perm.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            {hasChanges && !isAdminRole && (
                <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur px-4 py-3 md:left-14">
                    <div className="mx-auto max-w-screen-xl flex items-center justify-end gap-2">
                        <span className="text-sm text-muted-foreground mr-auto">O'zgartirishlar saqlanmagan</span>
                        <Button variant="outline" onClick={handleReset} disabled={assignPermissions.isPending}>
                            Bekor qilish
                        </Button>
                        <Button onClick={handleSave} isLoading={assignPermissions.isPending}>
                            <Save className="h-4 w-4 mr-2" />
                            Saqlash
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RolePermissionsPage;
