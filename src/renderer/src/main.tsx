import React from 'react';
import { createRoot } from 'react-dom/client';
import 'pdfjs-dist/web/pdf_viewer.css';
import './index.css';
import { applyTheme } from './lib/theme';
import App from './App';

applyTheme();
createRoot(document.getElementById('root')!).render(<App />);
