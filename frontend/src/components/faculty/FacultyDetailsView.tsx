import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import { FacultyKafedrasView } from './FacultyKafedrasView';

interface FacultyDetailsViewProps {
    faculty: Faculty;
    onBack: () => void;
    onOpenKafedra: (kafedra: Kafedra) => void;
}

export const FacultyDetailsView = ({ faculty, onBack, onOpenKafedra }: FacultyDetailsViewProps) => (
    <FacultyKafedrasView faculty={faculty} onBack={onBack} onOpenKafedra={onOpenKafedra} />
);
