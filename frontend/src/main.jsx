import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ToastProvider, ErrorBoundary } from './ui';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider><ToastProvider><ErrorBoundary><App /></ErrorBoundary></ToastProvider></AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
