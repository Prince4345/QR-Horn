import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CallProvider>
        <App />
      </CallProvider>
    </AuthProvider>
  </StrictMode>,
);
