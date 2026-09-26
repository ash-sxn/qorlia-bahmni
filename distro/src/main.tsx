import {
  initFontAwesome,
  applyHospitalBranding,
  DEFAULT_BRANDING,
  parseHospitalBranding,
} from '@bahmni/design-system';
import '@bahmni/widgets/styles';
import React, { StrictMode } from 'react';
import * as ReactDOMModule from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './app/app';
import { PUBLIC_PATH } from './constants/app';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    React: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ReactDOM: any;
  }
}

// Required by form2-controls helpers.js — must be synchronous
window.React = React;
window.ReactDOM = ReactDOMModule;

initFontAwesome();

async function start(): Promise<void> {
  let branding = DEFAULT_BRANDING;
  try {
    const response = await fetch(`${PUBLIC_PATH}assets/branding.json`, {
      cache: 'no-store',
    });
    if (response.ok) branding = parseHospitalBranding(await response.json());
  } catch {
    // An absent or invalid deployment config keeps the accessible Qorlia default.
  }
  applyHospitalBranding(branding);
  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <StrictMode>
      <BrowserRouter basename={PUBLIC_PATH ?? '/'}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void start();
