import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { SessionProvider } from './lib/session.jsx';
import { setNonce } from 'get-nonce';
import './styles.css';

const styleNonce = document.querySelector('meta[name="nestlet-style-nonce"]')?.content;
if (/^[A-Za-z0-9+/]{24}$/u.test(styleNonce || '')) setNonce(styleNonce);

createRoot(document.getElementById('root')).render(
  <React.StrictMode><SessionProvider><App /></SessionProvider></React.StrictMode>
);
