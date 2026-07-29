import { useState } from 'react';
import type { Faculty } from '@/services/facultyService';
import type { Kafedra } from '@/services/kafedraService';
import type { Group } from '@/services/groupService';
import { FacultyKafedrasView } from './FacultyKafedrasView';
import { FacultyGroupsView } from './FacultyGroupsView';
import { Crumbs } from './Crumbs';
import { ArrowLeft, Layers, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FacultyDetailsViewProps {
    faculty: Faculty;
    onBack: () => void;
    onOpenKafedra: (kafedra: Kafedra) => void;
    onOpenGroup: (group: Group) => void;
}

export const FacultyDetailsView = ({ faculty, onBack, onOpenKafedra, onOpenGroup }: FacultyDetailsViewProps) => {
    const [activeTab, setActiveTab] = useState<'kafedras' | 'groups'>('kafedras');

    return (
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
                    <h1 className="text-xl font-semibold tracking-tight capitalize">{faculty.name}</h1>
                </div>

                <div className="flex items-center gap-2 border-b border-border pb-px">
                    <button
                        onClick={() => setActiveTab('kafedras')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'kafedras'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:border-muted hover:text-foreground'
                        }`}
                    >
                        <Layers className="h-4 w-4" />
                        Kafedralar
                    </button>
                    <button
                        onClick={() => setActiveTab('groups')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'groups'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:border-muted hover:text-foreground'
                        }`}
                    >
                        <UsersRound className="h-4 w-4" />
                        Guruhlar
                    </button>
                </div>
            </div>

            {activeTab === 'kafedras' && (
                <div className="mt-4">
                    <FacultyKafedrasView 
                        faculty={faculty} 
                        onBack={onBack} 
                        onOpenKafedra={onOpenKafedra} 
                        hideHeader // We'll pass a prop to hide the redundant header
                    />
                </div>
            )}

            {activeTab === 'groups' && (
                <div className="mt-4">
                    <FacultyGroupsView 
                        faculty={faculty} 
                        onBack={onBack} 
                        onOpenGroup={onOpenGroup} 
                        hideHeader // We'll pass a prop to hide the redundant header
                    />
                </div>
            )}
        </div>
    );
};
