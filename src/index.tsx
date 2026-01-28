/* @refresh reload */
import 'solid-devtools';
import './index.css';

import { render, Suspense } from 'solid-js/web';

import App from './app';
import { Router } from '@solidjs/router';
import { routes } from './routes';
import type { JSX } from 'solid-js';
import type { MountableElement } from 'solid-js/web';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(
  () => <Router root={(props) => <App>{props.children as Element}</App>}>{routes}</Router> as unknown as JSX.Element,
  root as MountableElement,
);
