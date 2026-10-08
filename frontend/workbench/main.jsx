import React from 'react';
import { createRoot } from 'react-dom/client';
import { SessionProvider } from '@/lib/session';
import { WorkbenchApp } from './workbench-app.jsx';
import '../styles.css';
import './tokens.css';
import './workbench.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><SessionProvider><WorkbenchApp /></SessionProvider></React.StrictMode>
);
