import { SwitchField } from '@/components/ui/SwitchField';

interface Props {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}

function SettingRow({ id, title, hint, checked, onCheckedChange }: Props & { id: string; title: string; hint: string }) {
    return <SwitchField id={id} title={title} description={hint} checked={checked} onCheckedChange={onCheckedChange} />;
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
