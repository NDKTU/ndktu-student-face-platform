import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import { FacultyKafedrasView } from './FacultyKafedrasView';
import { Crumbs } from './Crumbs';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FacultyDetailsViewProps {
    faculty: Faculty;
    onBack: () => void;
    onOpenKafedra: (kafedra: Kafedra) => void;
}

export const FacultyDetailsView = ({ faculty, onBack, onOpenKafedra }: FacultyDetailsViewProps) => (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <Crumbs items={[
                    { label: 'Fakultetlar', onClick: onBack },
                    { label: faculty.name },
                ]} />
                
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Orqaga
                    </Button>
                    <h1 className="page-title capitalize">{faculty.name}</h1>
                </div>

                <p className="page-description">Kafedrani tanlang va mutaxassisliklarni ko'ring</p>
            </div>

            <FacultyKafedrasView faculty={faculty} onBack={onBack} onOpenKafedra={onOpenKafedra} hideHeader />
        </div>
);
