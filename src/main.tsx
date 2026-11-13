import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Providers } from './data/context';
import { App } from './App';
import { initDisplayPrefs } from './components/DisplaySettings';
import './styles/theme.css';
import './styles/app.css';
import './styles/ehr.css';

initDisplayPrefs();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Providers>
        <App />
      </Providers>
    </BrowserRouter>
  </StrictMode>,
);
