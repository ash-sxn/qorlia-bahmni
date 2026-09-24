import {
  initFontAwesome,
  applyBahmniTheme,
  BAHMNI_DEFAULT_THEME,
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

applyBahmniTheme({
  ...BAHMNI_DEFAULT_THEME,
  'background-brand': '#1F5238',
  'button-primary': '#1F5238',
  'button-primary-hover': '#173E2B',
  'button-primary-active': '#123221',
  'button-tertiary': '#1F5238',
  'button-tertiary-hover': '#173E2B',
  'button-tertiary-active': '#123221',
  interactive: '#1F5238',
  focus: '#1F5238',
  'border-interactive': '#1F5238',
  'link-primary': '#1F5238',
  'link-primary-hover': '#173E2B',
  'link-secondary': '#173E2B',
  'layer-01': '#F5F7F5',
});
initFontAwesome();

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <BrowserRouter basename={PUBLIC_PATH ?? '/'}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
