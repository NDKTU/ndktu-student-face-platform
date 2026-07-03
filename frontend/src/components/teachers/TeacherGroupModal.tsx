import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search } from 'lucide-react';
import { useGroups } from '@/hooks/useGroups';
import { useAssignGroups } from '@/hooks/useTeachers';
import { useAuth } from '@/context/AuthContext';
import type { Teacher } from '@/services/teacherService';

interface TeacherGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    teacher: Teacher | null;
}

export const TeacherGroupModal = ({ isOpen, onClose, teacher }: TeacherGroupModalProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const { hasPermission } = useAuth();
    const { data: groupsData } = useGroups(
        1,
        100,
        debouncedSearch,
        undefined,
        undefined,
        hasPermission('read:group'),
    );
    const assignGroupsMutation = useAssignGroups();
    const groups = groupsData?.groups || [];

    const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

    useEffect(() => {
        if (teacher && isOpen) {
            setSelectedGroupIds(teacher.employee?.user?.group_teachers?.map((g: any) => g.group_id) || []);
            setSearchQuery('');
            setDebouncedSearch('');
        }
    }, [teacher, isOpen]);

    const handleToggleGroup = (id: number) => {
        setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
    };

    const handleSave = () => {
        if (!teacher || !teacher.employee?.user) return;
        assignGroupsMutation.mutate({ user_id: teacher.employee.user.id, group_ids: selectedGroupIds }, {
            onSuccess: () => onClose(),
            onError: () => alert("Guruhlarni biriktirishda xatolik yuz berdi"),
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${teacher?.employee?.full_name} ga guruhlarni biriktirish`}>
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Guruhlarni qidirish..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-4 border rounded-md bg-muted/20">
                    {groups.map(group => (
                        <div key={group.id} className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id={`group-${group.id}`}
                                checked={selectedGroupIds.includes(group.id)}
                                onChange={() => handleToggleGroup(group.id)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <label htmlFor={`group-${group.id}`} className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                {group.name}
                            </label>
                        </div>
                    ))}
                    {groups.length === 0 && <span className="text-sm text-muted-foreground">Guruhlar topilmadi.</span>}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button onClick={handleSave} isLoading={assignGroupsMutation.isPending}>Saqlash</Button>
                </div>
            </div>
        </Modal>
    );
};
