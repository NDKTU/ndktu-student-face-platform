import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
        <Modal isOpen={isOpen} onClose={handleClose} title="Hemisdan Talaba Import Qilish">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Hemis Logini (Talaba raqami)</label>
                    <Input 
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        placeholder="32120... yoki 39..."
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Parol</label>
                    <Input 
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Hemis paroli"
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
