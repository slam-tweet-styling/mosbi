import { useEffect } from 'react';
import { Header } from '@/components/panels/Header';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { BottomPanel } from '@/components/panels/BottomPanel';
import { Canvas } from '@/components/canvas/Canvas';
import { useUIState } from '@/core/state/store';
import { logger, LogCategories } from '@/core/logger';

export default function App() {
  const { mode } = useUIState();

  useEffect(() => {
    logger.info(LogCategories.App, '🚀 CJMBI Dashboard Builder started');
    logger.info(LogCategories.App, `Environment: ${import.meta.env.MODE}`);
    
    // Global error handler
    const handleError = (event: ErrorEvent) => {
      logger.error(LogCategories.App, 'Uncaught error', event.error, { 
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.error(LogCategories.App, 'Unhandled promise rejection', event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Present mode - full screen canvas only
  if (mode === 'present') {
    return (
      <div className="h-screen bg-surface-900">
        <Canvas />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface-100">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        <LeftPanel />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Canvas />
          <BottomPanel />
        </div>
        
        <RightPanel />
      </div>
    </div>
  );
}
