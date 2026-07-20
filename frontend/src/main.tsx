import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { ChatProvider } from './context/ChatContext';
import { ThemeProvider } from './context/ThemeContext';
import { initRingtoneUnlock } from './lib/ringtone';
import { initMessageSoundUnlock } from './lib/messageSound';
import { initNativeShell } from './lib/nativeShell';
import { bounceWebOAuthCallbackToApp } from './lib/nativeOAuth';
import App from './App.tsx';
import './index.css';

// If OAuth lands on the website in Chrome, bounce into the Android app
bounceWebOAuthCallbackToApp();

initRingtoneUnlock();
initMessageSoundUnlock();
void initNativeShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <CallProvider>
          <ChatProvider>
            <App />
          </ChatProvider>
        </CallProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
