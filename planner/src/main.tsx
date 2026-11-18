import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && !('__TAURI_INTERNALS__' in window) && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
