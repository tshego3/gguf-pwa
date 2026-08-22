import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { preventPinchZoom } from './pwa/preventPinchZoom';
import { theme } from './theme';
import './theme/markdown.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw { type: 'load', message: 'Root element missing from index.html' };
}

preventPinchZoom();

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark" forceColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
);
