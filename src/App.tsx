import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavShell } from './components/NavShell';
import { OfflineBanner } from './components/OfflineBanner';
import { ReloadToIsolateBanner } from './components/ReloadToIsolateBanner';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useCapabilities } from './hooks/useCapabilities';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { ensurePersistentStorageRequested } from './models/persistentStorage';
import { applyWaitingServiceWorker, registerServiceWorker } from './pwa/registerServiceWorker';
import { useHashRoute } from './router/useHashRoute';
import { Chat } from './screens/Chat';
import { Models } from './screens/Models';
import { Settings } from './screens/Settings';

export function App(): ReactNode {
  const [route, navigate] = useHashRoute();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [isolateBannerDismissed, setIsolateBannerDismissed] = useState(false);
  const isOnline = useOnlineStatus();
  const { capabilities } = useCapabilities();

  useEffect(() => {
    void ensurePersistentStorageRequested();
  }, []);

  useEffect(() => {
    void registerServiceWorker({ onUpdateAvailable: () => setUpdateAvailable(true) });
  }, []);

  const handleReloadToUpdate = useCallback(() => {
    applyWaitingServiceWorker();
  }, []);

  const handleReloadToIsolate = useCallback(() => {
    window.location.reload();
  }, []);

  const showIsolateBanner =
    !isolateBannerDismissed &&
    !!capabilities &&
    !capabilities.webgpu &&
    !capabilities.crossOriginIsolated &&
    'serviceWorker' in navigator &&
    !!navigator.serviceWorker.controller;

  return (
    <NavShell route={route} onNavigate={navigate}>
      {!isOnline && <OfflineBanner />}
      {showIsolateBanner && (
        <ReloadToIsolateBanner
          onReload={() => {
            setIsolateBannerDismissed(true);
            handleReloadToIsolate();
          }}
        />
      )}
      {route === 'chat' && <Chat />}
      {route === 'models' && <Models />}
      {route === 'settings' && <Settings />}
      {updateAvailable && !updateDismissed && (
        <UpdatePrompt onReload={handleReloadToUpdate} onDismiss={() => setUpdateDismissed(true)} />
      )}
    </NavShell>
  );
}
