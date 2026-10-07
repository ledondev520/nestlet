import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { captureAuthFragment } from './features/auth/auth-route.js';
import { SessionProvider } from './lib/session.jsx';
import { setNonce } from 'get-nonce';
import './styles.css';

// Capture and remove email-link secrets before React effects or network requests.
const initialAuthLink = captureAuthFragment(window);
const styleNonce = document.querySelector('meta[name="nestlet-style-nonce"]')?.content;
if (/^[A-Za-z0-9+/]{24}$/u.test(styleNonce || '')) setNonce(styleNonce);

createRoot(document.getElementById('root')).render(
  <React.StrictMode><SessionProvider><App initialAuthLink={initialAuthLink} /></SessionProvider></React.StrictMode>
);
