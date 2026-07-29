import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useGroups } from '@/hooks/useGroups';
import { useUpdateStudentGroup } from '@/hooks/useStudents';
import { useAuth } from '@/context/AuthContext';
import type { Student } from '@/services/studentService';

interface ChangeGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    student: Student | null;
    onSuccess?: () => void;
}

export const ChangeGroupModal: React.FC<ChangeGroupModalProps> = ({ isOpen, onClose, student, onSuccess }) => {
    const { hasPermission } = useAuth();
    const { data: groupsData, isLoading: isGroupsLoading } = useGroups(
        1,
        100,
        '',
        undefined,
        undefined,
        hasPermission('read:group'),
    );
    const updateGroupMutation = useUpdateStudentGroup();
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');

    useEffect(() => {
        if (student?.group_id) {
            setSelectedGroupId(String(student.group_id));
        } else {
            setSelectedGroupId('');
        }
    }, [student, isOpen]);

    const groupOptions = groupsData?.groups.map((g) => ({
        value: String(g.id),
        label: g.name,
    })) || [];

    const handleSave = () => {
        if (!student || !selectedGroupId) return;
        updateGroupMutation.mutate(
            { id: student.id, groupId: parseInt(selectedGroupId, 10) },
            {
                onSuccess: () => {
                    onClose();
                    onSuccess?.();
                },
                onError: (error: any) => {
                    alert(error?.response?.data?.detail || 'Guruhni o\'zgartirishda xatolik yuz berdi');
                }
            }
        );
    };

    if (!isOpen || !student) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Guruhni O'zgartirish">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">
                        Talaba: <span className="font-semibold">{student.full_name || student.student_id_number}</span>
                    </label>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Yangi guruhni tanlang</label>
                    {isGroupsLoading ? (
                        <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guruhlar yuklanmoqda...</div>
                    ) : (
                        <Combobox
                            options={groupOptions}
                            value={selectedGroupId}
                            onChange={setSelectedGroupId}
                            placeholder="Guruhni tanlang..."
                        />
                    )}
                </div>

                <div className="pt-4 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={updateGroupMutation.isPending}>
                        Bekor qilish
                    </Button>
                    <Button onClick={handleSave} disabled={updateGroupMutation.isPending || !selectedGroupId || selectedGroupId === String(student.group_id)}>
                        {updateGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Saqlash
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
