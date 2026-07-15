import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { ChatProvider } from './context/ChatContext';
import { initRingtoneUnlock } from './lib/ringtone';
import { initMessageSoundUnlock } from './lib/messageSound';
import App from './App.tsx';
import './index.css';

initRingtoneUnlock();
initMessageSoundUnlock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CallProvider>
        <ChatProvider>
          <App />
        </ChatProvider>
      </CallProvider>
    </AuthProvider>
  </StrictMode>,
);
