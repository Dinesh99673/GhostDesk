import { Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage.js';
import { RoomPage } from './pages/RoomPage.js';
import { Toasts } from './components/Toasts.js';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/r/:roomId" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
