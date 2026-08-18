import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface HemisImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HemisImportModal: React.FC<HemisImportModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!login || !password) return;

        onClose();
        navigate(`/admin/hemis-sync?login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`);
    };

    const handleClose = () => {
        setLogin('');
        setPassword('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Hemisdan talaba import qilish">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                        Talabaning Hemis login va paroli faqat ma'lumotlarni o'qish uchun ishlatiladi.
                        Keyingi qadamda import oldidan ma'lumotlarni tasdiqlaysiz.
                    </span>
                </div>

                <div className="space-y-2">
                    <label htmlFor="hemis-login" className="text-sm font-medium text-foreground">
                        Hemis logini (talaba raqami)
                    </label>
                    <Input
                        id="hemis-login"
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        placeholder="32120... yoki 39..."
                        autoComplete="off"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="hemis-password" className="text-sm font-medium text-foreground">
                        Parol
                    </label>
                    <Input
                        id="hemis-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Hemis paroli"
                        autoComplete="new-password"
                        required
                    />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={handleClose}>
                        Bekor qilish
                    </Button>
                    <Button type="submit" disabled={!login || !password}>
                        Davom etish
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
