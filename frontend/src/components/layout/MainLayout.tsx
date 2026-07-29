import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import CrumbBar from './CrumbBar';

const MainLayout = () => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    const handleMenuClick = () => {
        if (window.matchMedia('(min-width: 768px)').matches) {
            setCollapsed((c) => !c);
        } else {
            setMobileOpen((o) => !o);
        }
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <AppHeader onMenuClick={handleMenuClick} />
            <div className="flex min-h-0 flex-1">
                <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
                <div className="flex min-w-0 flex-1 flex-col">
                    <CrumbBar />
                    <main className="flex-1 overflow-y-auto overflow-x-hidden">
                        <div className="p-4 sm:p-6 lg:px-8 lg:py-7">
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default MainLayout;
