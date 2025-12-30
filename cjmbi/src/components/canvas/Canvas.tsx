import { useCallback, useRef, useState, useEffect } from 'react';
import { useAppStore, useWidgets, useUIState } from '@/core/state/store';
import { WidgetRenderer } from './WidgetRenderer';
import { Icon } from '@/components/common/Icon';
import { logger, LogCategories } from '@/core/logger';
import type { WidgetSpec, GridPosition } from '@/types';

const GRID_COLUMNS = 24;
const GRID_ROW_HEIGHT = 40;
const MIN_WIDTH = 2;
const MIN_HEIGHT = 2;

export function Canvas() {
  const widgets = useWidgets();
  const { mode, selectedWidgetId, zoom } = useUIState();
  const { selectWidget, updateWidgetPosition } = useAppStore();
  const showGrid = useAppStore((state) => state.project.settings.showGrid);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        selectWidget(null);
      }
    },
    [selectWidget]
  );

  // Calculate canvas height based on widgets
  const maxY = widgets.reduce((max, w) => Math.max(max, w.position.y + w.position.height), 0);
  const canvasHeight = Math.max(600, (maxY + 4) * GRID_ROW_HEIGHT);

  return (
    <div className="flex-1 bg-surface-100 overflow-auto p-6">
      <div
        ref={canvasRef}
        className={`relative bg-white rounded-lg shadow-sm border border-surface-200 mx-auto transition-transform ${
          showGrid && mode === 'design' ? 'grid-overlay' : ''
        }`}
        style={{
          width: '100%',
          maxWidth: '1400px',
          minHeight: canvasHeight,
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top center',
        }}
        onClick={handleCanvasClick}
      >
        {widgets.length === 0 ? (
          <EmptyCanvas />
        ) : (
          widgets.map((widget) => (
            <WidgetContainer
              key={widget.id}
              widget={widget}
              isSelected={selectedWidgetId === widget.id}
              isDesignMode={mode === 'design'}
              gridRowHeight={GRID_ROW_HEIGHT}
              gridColumns={GRID_COLUMNS}
              canvasRef={canvasRef}
              onPositionChange={updateWidgetPosition}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <Icon name="layoutGrid" size={48} className="mx-auto mb-4 text-surface-300" />
        <h3 className="text-lg font-medium text-surface-600 mb-2">
          Start Building Your Dashboard
        </h3>
        <p className="text-sm text-surface-500 max-w-md">
          Drag widgets from the left panel or click on them to add to the canvas.
          Connect a data source to visualize your data.
        </p>
      </div>
    </div>
  );
}

interface WidgetContainerProps {
  widget: WidgetSpec;
  isSelected: boolean;
  isDesignMode: boolean;
  gridRowHeight: number;
  gridColumns: number;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onPositionChange: (id: string, position: GridPosition) => void;
}

type DragMode = 'none' | 'move' | 'resize';

function WidgetContainer({
  widget,
  isSelected,
  isDesignMode,
  gridRowHeight,
  gridColumns,
  canvasRef,
  onPositionChange,
}: WidgetContainerProps) {
  const { selectWidget } = useAppStore();
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [originalPosition, setOriginalPosition] = useState<GridPosition | null>(null);
  const [previewPosition, setPreviewPosition] = useState<GridPosition | null>(null);

  const getCellWidth = useCallback(() => {
    if (!canvasRef.current) return 50;
    return canvasRef.current.getBoundingClientRect().width / gridColumns;
  }, [canvasRef, gridColumns]);

  // Handle mouse down for drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, mode: DragMode) => {
      if (!isDesignMode || mode === 'none') return;
      
      e.preventDefault();
      e.stopPropagation();
      
      selectWidget(widget.id);
      setDragMode(mode);
      setDragStart({ x: e.clientX, y: e.clientY });
      setOriginalPosition({ ...widget.position });
      setPreviewPosition({ ...widget.position });
      
      logger.debug(LogCategories.Widget, `Started ${mode} for widget "${widget.title}"`, { 
        id: widget.id, 
        position: widget.position 
      });
    },
    [isDesignMode, widget, selectWidget]
  );

  // Handle mouse move during drag
  useEffect(() => {
    if (dragMode === 'none' || !originalPosition) return;

    const handleMouseMove = (e: MouseEvent) => {
      const cellWidth = getCellWidth();
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      if (dragMode === 'move') {
        const gridDeltaX = Math.round(deltaX / cellWidth);
        const gridDeltaY = Math.round(deltaY / gridRowHeight);
        
        const newX = Math.max(0, Math.min(gridColumns - originalPosition.width, originalPosition.x + gridDeltaX));
        const newY = Math.max(0, originalPosition.y + gridDeltaY);
        
        setPreviewPosition({
          ...originalPosition,
          x: newX,
          y: newY,
        });
      } else if (dragMode === 'resize') {
        const gridDeltaW = Math.round(deltaX / cellWidth);
        const gridDeltaH = Math.round(deltaY / gridRowHeight);
        
        const newWidth = Math.max(MIN_WIDTH, Math.min(gridColumns - originalPosition.x, originalPosition.width + gridDeltaW));
        const newHeight = Math.max(MIN_HEIGHT, originalPosition.height + gridDeltaH);
        
        setPreviewPosition({
          ...originalPosition,
          width: newWidth,
          height: newHeight,
        });
      }
    };

    const handleMouseUp = () => {
      if (previewPosition) {
        onPositionChange(widget.id, previewPosition);
        logger.debug(LogCategories.Widget, `Finished ${dragMode} for widget "${widget.title}"`, { 
          id: widget.id, 
          position: previewPosition 
        });
      }
      
      setDragMode('none');
      setOriginalPosition(null);
      setPreviewPosition(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, dragStart, originalPosition, previewPosition, widget, gridColumns, gridRowHeight, getCellWidth, onPositionChange]);

  // Use preview position during drag, otherwise use widget position
  const displayPosition = previewPosition || widget.position;

  const style = {
    position: 'absolute' as const,
    left: `${(displayPosition.x / gridColumns) * 100}%`,
    top: displayPosition.y * gridRowHeight,
    width: `${(displayPosition.width / gridColumns) * 100}%`,
    height: displayPosition.height * gridRowHeight,
    padding: '4px',
    zIndex: dragMode !== 'none' ? 1000 : isSelected ? 10 : 1,
    transition: dragMode !== 'none' ? 'none' : 'box-shadow 0.2s',
  };

  return (
    <div
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        selectWidget(widget.id);
      }}
    >
      <div
        className={`h-full rounded-lg border bg-white overflow-hidden ${
          isSelected
            ? 'border-mosaic-500 ring-2 ring-mosaic-200 shadow-lg'
            : 'border-surface-200 hover:border-surface-300 shadow-sm'
        } ${dragMode !== 'none' ? 'opacity-90 shadow-xl' : ''}`}
      >
        {/* Widget Header - Drag Handle */}
        <div 
          className={`px-3 py-2 border-b border-surface-100 bg-surface-50 ${
            isDesignMode ? 'cursor-move select-none' : ''
          }`}
          onMouseDown={(e) => handleMouseDown(e, 'move')}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-surface-700 truncate flex-1">
              {widget.title || 'Untitled Widget'}
            </h4>
            {isDesignMode && (
              <Icon name="grip" size={12} className="text-surface-400 ml-2 flex-shrink-0" />
            )}
          </div>
        </div>
        
        {/* Widget Content */}
        <div className="p-2 h-[calc(100%-2.25rem)] overflow-hidden">
          <WidgetRenderer widget={widget} />
        </div>

        {/* Resize Handle (design mode only) */}
        {isDesignMode && isSelected && (
          <div 
            className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize bg-mosaic-500 rounded-sm opacity-80 hover:opacity-100 flex items-center justify-center"
            onMouseDown={(e) => handleMouseDown(e, 'resize')}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-white">
              <path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
