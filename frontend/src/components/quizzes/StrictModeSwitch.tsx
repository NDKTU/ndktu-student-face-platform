import { Switch } from '@/components/ui/Switch';

interface Props {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}

/** «Qat'iy rejim» — test, nazorat, dars testi va elementar test oynalarida bir xil. */
export function StrictModeSwitch({ checked, onCheckedChange }: Props) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <label htmlFor="quiz-strict-mode" className="cursor-pointer">
                <div className="text-sm font-medium">Qat'iy rejim</div>
                <div className="text-xs text-muted-foreground">
                    Talaba sahifadan chiqsa, boshqa ilovani ochsa yoki ekranni bo'lsa — test darhol yopiladi
                </div>
            </label>
            <Switch id="quiz-strict-mode" checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}
