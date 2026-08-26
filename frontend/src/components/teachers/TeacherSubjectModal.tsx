import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Search } from 'lucide-react';
import { useSubjects } from '@/hooks/useSubjects';
import { useAssignSubjects } from '@/hooks/useTeachers';
import { useAuth } from '@/context/AuthContext';
import type { Teacher } from '@/services/teacherService';

interface TeacherSubjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    teacher: Teacher | null;
}

export const TeacherSubjectModal = ({ isOpen, onClose, teacher }: TeacherSubjectModalProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const { hasPermission } = useAuth();
    const { data: subjectsData } = useSubjects(1, 100, debouncedSearch, undefined, hasPermission('read:subject'));
    const assignSubjectsMutation = useAssignSubjects();
    const subjects = subjectsData?.subjects || [];

    const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);

    useEffect(() => {
        if (teacher && isOpen) {
            setSelectedSubjectIds(teacher.teacher_subjects?.map(s => s.subject_id) || []);
            setSearchQuery('');
            setDebouncedSearch('');
        }
    }, [teacher, isOpen]);

    const handleToggleSubject = (id: number) => {
        setSelectedSubjectIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };

    const handleSave = () => {
        if (!teacher) return;
        assignSubjectsMutation.mutate({ teacher_id: teacher.id, subject_ids: selectedSubjectIds }, {
            onSuccess: () => {
                toast.success('Fanlar biriktirildi');
                onClose();
            },
            onError: () => toast.error("Fanlarni biriktirishda xatolik yuz berdi"),
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${teacher?.full_name} ga fanlarni biriktirish`}>
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Fanlarni qidirish..."
                        className="pl-8"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-4 border rounded-md bg-muted/20">
                    {subjects.map(subject => (
                        <div key={subject.id} className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id={`subject-${subject.id}`}
                                checked={selectedSubjectIds.includes(subject.id)}
                                onChange={() => handleToggleSubject(subject.id)}
                                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                            />
                            <label htmlFor={`subject-${subject.id}`} className="text-sm cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis">
                                {subject.name}
                            </label>
                        </div>
                    ))}
                    {subjects.length === 0 && <span className="text-sm text-muted-foreground">Fanlar topilmadi.</span>}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>Bekor qilish</Button>
                    <Button onClick={handleSave} isLoading={assignSubjectsMutation.isPending}>Saqlash</Button>
                </div>
            </div>
        </Modal>
    );
};
