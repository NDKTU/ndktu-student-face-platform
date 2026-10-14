import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ZoomRoom from './ZoomRoom';

// Alohida kirish nuqtasi: `src/main.tsx` dagi provayderlar va `index.css`
// bu yerga olinmaydi — Zoom Client View sahifani o'zi boshqaradi.
createRoot(document.getElementById('zoom-room')!).render(
    <StrictMode>
        <ZoomRoom />
    </StrictMode>,
);
