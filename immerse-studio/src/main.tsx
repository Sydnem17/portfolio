import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './editor/App';
import './editor/editor.css';
import './player/player.css'; // the live preview renders the real player

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
