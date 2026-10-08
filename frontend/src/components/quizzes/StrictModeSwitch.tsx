import { Switch } from '@/components/ui/Switch';

interface Props {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}

function SettingRow({ id, title, hint, checked, onCheckedChange }: Props & { id: string; title: string; hint: string }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <label htmlFor={id} className="cursor-pointer">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">{hint}</div>
            </label>
            <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

/** «Qat'iy rejim» — test, nazorat, dars testi va elementar test oynalarida bir xil. */
export function StrictModeSwitch(props: Props) {
    return (
        <SettingRow
            id="quiz-strict-mode"
            title="Qat'iy rejim"
            hint="Talaba sahifadan chiqsa, boshqa ilovani ochsa yoki ekranni bo'lsa — test darhol yopiladi"
            {...props}
        />
    );
}

/** «Matnni yashirish» — o'sha oynalarda, qat'iy rejim ostida. */
export function HoldToRevealSwitch(props: Props) {
    return (
        <SettingRow
            id="quiz-hold-to-reveal"
            title="Matnni yashirish"
            hint="Savol faqat talaba «ko'rish» tugmasini bosib turganda ko'rinadi — oddiy skrinshot xira chiqadi"
            {...props}
        />
    );
}
