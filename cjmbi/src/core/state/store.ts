import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Project,
  WidgetSpec,
  DataSource,
  Link,
  UIState,
  PerformanceMetrics,
  GridPosition,
  EditorMode,
} from '@/types';
import { logger, LogCategories } from '@/core/logger';

interface AppState {
  // Project state
  project: Project;
  
  // UI state
  ui: UIState;
  
  // Performance metrics
  performance: PerformanceMetrics;
  
  // Project actions
  setProjectName: (name: string) => void;
  setProjectDescription: (description: string) => void;
  
  // Data source actions
  addDataSource: (source: DataSource) => void;
  removeDataSource: (id: string) => void;
  updateDataSourceStatus: (id: string, status: DataSource['status']) => void;
  
  // Widget actions
  addWidget: (widget: WidgetSpec) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<WidgetSpec>) => void;
  updateWidgetPosition: (id: string, position: GridPosition) => void;
  duplicateWidget: (id: string) => void;
  
  // Link actions
  addLink: (link: Link) => void;
  removeLink: (id: string) => void;
  
  // UI actions
  setMode: (mode: EditorMode) => void;
  selectWidget: (id: string | null) => void;
  hoverWidget: (id: string | null) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setLeftPanelTab: (tab: UIState['leftPanelTab']) => void;
  setRightPanelTab: (tab: UIState['rightPanelTab']) => void;
  setBottomPanelTab: (tab: UIState['bottomPanelTab']) => void;
  setZoom: (zoom: number) => void;
  
  // Performance actions
  updatePerformance: (metrics: Partial<PerformanceMetrics>) => void;
  resetPerformance: () => void;
  
  // Project persistence
  loadProject: (project: Project) => void;
  resetProject: () => void;
  exportProject: () => Project;
}

const createDefaultProject = (): Project => ({
  id: crypto.randomUUID(),
  name: 'Untitled Dashboard',
  description: '',
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  dataSources: [],
  widgets: [],
  links: [],
  params: [],
  selections: [],
  settings: {
    gridColumns: 24,
    gridRowHeight: 40,
    snapToGrid: true,
    showGrid: true,
    theme: 'light',
  },
});

const createDefaultUI = (): UIState => ({
  mode: 'design',
  selectedWidgetId: null,
  hoveredWidgetId: null,
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  leftPanelTab: 'widgets',
  rightPanelTab: 'properties',
  bottomPanelTab: 'logs',
  zoom: 100,
});

const createDefaultPerformance = (): PerformanceMetrics => ({
  queryCount: 0,
  totalQueryTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rowsProcessed: 0,
});

export const useAppStore = create<AppState>()(
  immer((set, get) => {
    logger.info(LogCategories.Store, 'Initializing app store');
    
    return {
      project: createDefaultProject(),
      ui: createDefaultUI(),
      performance: createDefaultPerformance(),

      // Project actions
      setProjectName: (name) =>
        set((state) => {
          logger.debug(LogCategories.Store, `Setting project name: "${name}"`);
          state.project.name = name;
          state.project.updatedAt = new Date().toISOString();
        }),

      setProjectDescription: (description) =>
        set((state) => {
          logger.debug(LogCategories.Store, 'Setting project description');
          state.project.description = description;
          state.project.updatedAt = new Date().toISOString();
        }),

      // Data source actions
      addDataSource: (source) =>
        set((state) => {
          logger.info(LogCategories.Store, `Adding data source: "${source.name}"`, { id: source.id, type: source.type });
          state.project.dataSources.push(source);
          state.project.updatedAt = new Date().toISOString();
        }),

      removeDataSource: (id) =>
        set((state) => {
          const source = state.project.dataSources.find((s) => s.id === id);
          logger.info(LogCategories.Store, `Removing data source: "${source?.name}"`, { id });
          state.project.dataSources = state.project.dataSources.filter(
            (s) => s.id !== id
          );
          state.project.updatedAt = new Date().toISOString();
        }),

      updateDataSourceStatus: (id, status) =>
        set((state) => {
          const source = state.project.dataSources.find((s) => s.id === id);
          if (source) {
            logger.debug(LogCategories.Store, `Data source "${source.name}" status: ${status}`);
            source.status = status;
          }
        }),

      // Widget actions
      addWidget: (widget) =>
        set((state) => {
          logger.info(LogCategories.Store, `Adding widget: "${widget.title}" (${widget.type})`, { 
            id: widget.id, 
            position: widget.position 
          });
          state.project.widgets.push(widget);
          state.project.updatedAt = new Date().toISOString();
        }),

      removeWidget: (id) =>
        set((state) => {
          const widget = state.project.widgets.find((w) => w.id === id);
          logger.info(LogCategories.Store, `Removing widget: "${widget?.title}"`, { id });
          state.project.widgets = state.project.widgets.filter((w) => w.id !== id);
          state.project.links = state.project.links.filter(
            (l) => l.source !== id && l.target !== id
          );
          if (state.ui.selectedWidgetId === id) {
            state.ui.selectedWidgetId = null;
          }
          state.project.updatedAt = new Date().toISOString();
        }),

      updateWidget: (id, updates) =>
        set((state) => {
          const widget = state.project.widgets.find((w) => w.id === id);
          if (widget) {
            logger.debug(LogCategories.Store, `Updating widget: "${widget.title}"`, { id, updates });
            Object.assign(widget, updates);
            state.project.updatedAt = new Date().toISOString();
          } else {
            logger.warn(LogCategories.Store, `Widget not found for update`, { id });
          }
        }),

      updateWidgetPosition: (id, position) =>
        set((state) => {
          const widget = state.project.widgets.find((w) => w.id === id);
          if (widget) {
            logger.debug(LogCategories.Store, `Moving widget: "${widget.title}"`, { id, position });
            widget.position = position;
            state.project.updatedAt = new Date().toISOString();
          }
        }),

      duplicateWidget: (id) =>
        set((state) => {
          const widget = state.project.widgets.find((w) => w.id === id);
          if (widget) {
            const newWidget: WidgetSpec = {
              ...JSON.parse(JSON.stringify(widget)),
              id: crypto.randomUUID(),
              position: {
                ...widget.position,
                x: widget.position.x + 1,
                y: widget.position.y + 1,
              },
            };
            logger.info(LogCategories.Store, `Duplicating widget: "${widget.title}"`, { 
              originalId: id, 
              newId: newWidget.id 
            });
            state.project.widgets.push(newWidget);
            state.ui.selectedWidgetId = newWidget.id;
            state.project.updatedAt = new Date().toISOString();
          }
        }),

      // Link actions
      addLink: (link) =>
        set((state) => {
          logger.info(LogCategories.Store, `Adding link: ${link.type}`, { 
            id: link.id, 
            source: link.source, 
            target: link.target 
          });
          state.project.links.push(link);
          state.project.updatedAt = new Date().toISOString();
        }),

      removeLink: (id) =>
        set((state) => {
          logger.info(LogCategories.Store, `Removing link`, { id });
          state.project.links = state.project.links.filter((l) => l.id !== id);
          state.project.updatedAt = new Date().toISOString();
        }),

      // UI actions
      setMode: (mode) =>
        set((state) => {
          logger.info(LogCategories.UI, `Switching mode: ${state.ui.mode} → ${mode}`);
          state.ui.mode = mode;
        }),

      selectWidget: (id) =>
        set((state) => {
          if (id !== state.ui.selectedWidgetId) {
            logger.debug(LogCategories.UI, `Selecting widget`, { id });
          }
          state.ui.selectedWidgetId = id;
          if (id) {
            state.ui.rightPanelOpen = true;
          }
        }),

      hoverWidget: (id) =>
        set((state) => {
          state.ui.hoveredWidgetId = id;
        }),

      toggleLeftPanel: () =>
        set((state) => {
          state.ui.leftPanelOpen = !state.ui.leftPanelOpen;
          logger.debug(LogCategories.UI, `Left panel: ${state.ui.leftPanelOpen ? 'open' : 'closed'}`);
        }),

      toggleRightPanel: () =>
        set((state) => {
          state.ui.rightPanelOpen = !state.ui.rightPanelOpen;
          logger.debug(LogCategories.UI, `Right panel: ${state.ui.rightPanelOpen ? 'open' : 'closed'}`);
        }),

      toggleBottomPanel: () =>
        set((state) => {
          state.ui.bottomPanelOpen = !state.ui.bottomPanelOpen;
          logger.debug(LogCategories.UI, `Bottom panel: ${state.ui.bottomPanelOpen ? 'open' : 'closed'}`);
        }),

      setLeftPanelTab: (tab) =>
        set((state) => {
          logger.debug(LogCategories.UI, `Left panel tab: ${tab}`);
          state.ui.leftPanelTab = tab;
        }),

      setRightPanelTab: (tab) =>
        set((state) => {
          logger.debug(LogCategories.UI, `Right panel tab: ${tab}`);
          state.ui.rightPanelTab = tab;
        }),

      setBottomPanelTab: (tab) =>
        set((state) => {
          logger.debug(LogCategories.UI, `Bottom panel tab: ${tab}`);
          state.ui.bottomPanelTab = tab;
        }),

      setZoom: (zoom) =>
        set((state) => {
          const newZoom = Math.max(25, Math.min(200, zoom));
          logger.debug(LogCategories.UI, `Zoom: ${newZoom}%`);
          state.ui.zoom = newZoom;
        }),

      // Performance actions
      updatePerformance: (metrics) =>
        set((state) => {
          Object.assign(state.performance, metrics);
        }),

      resetPerformance: () =>
        set((state) => {
          logger.debug(LogCategories.Store, 'Resetting performance metrics');
          state.performance = createDefaultPerformance();
        }),

      // Project persistence
      loadProject: (project) =>
        set((state) => {
          logger.info(LogCategories.Store, `Loading project: "${project.name}"`, { 
            id: project.id, 
            widgets: project.widgets.length,
            dataSources: project.dataSources.length 
          });
          state.project = project;
          state.ui = createDefaultUI();
          state.performance = createDefaultPerformance();
        }),

      resetProject: () =>
        set((state) => {
          logger.info(LogCategories.Store, 'Resetting project to default');
          state.project = createDefaultProject();
          state.ui = createDefaultUI();
          state.performance = createDefaultPerformance();
        }),

      exportProject: () => {
        const project = get().project;
        logger.info(LogCategories.Store, `Exporting project: "${project.name}"`);
        return project;
      },
    };
  })
);

// Selectors
export const useSelectedWidget = () =>
  useAppStore((state) => {
    const id = state.ui.selectedWidgetId;
    return id ? state.project.widgets.find((w) => w.id === id) : null;
  });

export const useWidgets = () => useAppStore((state) => state.project.widgets);
export const useDataSources = () => useAppStore((state) => state.project.dataSources);
export const useLinks = () => useAppStore((state) => state.project.links);
export const useUIState = () => useAppStore((state) => state.ui);
export const usePerformance = () => useAppStore((state) => state.performance);
