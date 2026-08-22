import { Loader, Stack } from '@mantine/core';
import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';
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

// Screens are split per the performance rule ("dynamic import() for screens
// and heavy modules") - but Chat deliberately is not. Chat is the landing
// route, so splitting it only moved it behind a second network hop
// (framework chunk, then Chat chunk) and Lighthouse measured LCP and TTI
// getting worse for it. Models and Settings are never the first paint, and
// Models in particular drags in the catalog, Hugging Face search, and the
// download manager, so those two stay lazy.
const Models = lazy(() => import('./screens/Models').then((m) => ({ default: m.Models })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));

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
      <Suspense
        fallback={
          <Stack align="center" py="xl">
            <Loader />
          </Stack>
        }
      >
        {route === 'chat' && <Chat />}
        {route === 'models' && <Models />}
        {route === 'settings' && <Settings />}
      </Suspense>
      {updateAvailable && !updateDismissed && (
        <UpdatePrompt onReload={handleReloadToUpdate} onDismiss={() => setUpdateDismissed(true)} />
      )}
    </NavShell>
  );
}
