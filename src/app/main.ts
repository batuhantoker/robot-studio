import { inject } from '@vercel/analytics';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono';
import 'katex/dist/katex.min.css';
import '@/ui/styles/base.css';
import '@/ui/styles/layout.css';
import '@/ui/styles/panels.css';
import '@/ui/styles/controls.css';
import '@/ui/styles/library.css';
import '@/ui/styles/stage.css';
import '@/ui/styles/fold.css';
import '@/ui/styles/mobile/shell.css';
import '@/ui/styles/mobile/stage.css';
import '@/ui/styles/guide.css';
import '@/ui/styles/pilot.css';
import { mountFolding } from '@/ui/shell/fold';
import { mountMobileDock } from '@/ui/shell/mobile/dock';
import { createLayout } from '@/ui/shell/layout';
import { initialState } from './bootstrap/initial-state';
import { mountPanels } from './bootstrap/mount-panels';
import { bindScene } from './controller/scene';
import { Studio } from './controller/studio';
import { catalog, loadCatalog } from './robots/catalog';
import { Store } from './state/store';

// Vite has no process.env in the browser, so the package can't tell dev from prod itself.
inject({ mode: import.meta.env.DEV ? 'development' : 'production' });

const store = new Store(initialState(await loadCatalog()));
bindScene(store);
const layout = createLayout(document.getElementById('app')!);
const studio = new Studio(layout.stage, store, catalog, (s) => layout.setLoading(s));
mountPanels(layout, studio);
mountFolding(layout);
mountMobileDock(layout, store);
await studio.activate(true);
Object.assign(window, { studio });
