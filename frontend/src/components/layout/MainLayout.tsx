import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { Outlet } from 'react-router-dom';
import { PageTransition } from './PageTransition';

const MainLayout = () => {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-200">
            <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
            <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
                <Navbar onMenuClick={() => setMobileOpen(!mobileOpen)} />
                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="w-full p-4 sm:p-6 lg:p-7">
                        <PageTransition>
                            <Outlet />
                        </PageTransition>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
