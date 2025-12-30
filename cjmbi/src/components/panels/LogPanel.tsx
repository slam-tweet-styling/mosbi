import { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/common/Icon';
import { logger, LogCategories, type LogEntry, type LogLevel } from '@/core/logger';

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-gray-500',
  info: 'text-blue-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
};

const LOG_LEVEL_BG: Record<LogLevel, string> = {
  debug: 'bg-gray-100',
  info: 'bg-blue-50',
  warn: 'bg-amber-50',
  error: 'bg-red-50',
};

export function LogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial load
    setEntries(logger.getEntries());

    // Subscribe to new entries
    const unsubscribe = logger.subscribe((entry) => {
      setEntries((prev) => [...prev.slice(-499), entry]);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const filteredEntries = entries.filter((entry) => {
    if (filter !== 'all' && entry.level !== filter) return false;
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
    return true;
  });

  const categories = ['all', ...Object.values(LogCategories)];

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatTime = (date: Date) => {
    return date.toISOString().split('T')[1].slice(0, 12);
  };

  const handleClear = () => {
    logger.clear();
    setEntries([]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 bg-surface-50">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as LogLevel | 'all')}
          className="select text-xs py-1 w-24"
        >
          <option value="all">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="select text-xs py-1 w-28"
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All Categories' : cat}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <label className="flex items-center gap-1 text-xs text-surface-600 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-3 h-3"
          />
          Auto-scroll
        </label>

        <button
          onClick={handleClear}
          className="btn btn-ghost text-xs px-2 py-1"
          title="Clear logs"
        >
          <Icon name="delete" size={14} />
        </button>

        <span className="text-xs text-surface-500">
          {filteredEntries.length} / {entries.length}
        </span>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-auto font-mono text-xs">
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-surface-400">
            No log entries
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className={`border-b border-surface-100 ${LOG_LEVEL_BG[entry.level]} hover:bg-opacity-80`}
            >
              <div
                className="flex items-start gap-2 px-3 py-1 cursor-pointer"
                onClick={() => (entry.data || entry.error) && toggleExpand(entry.id)}
              >
                <span className="text-surface-400 shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={`shrink-0 uppercase font-semibold w-12 ${LOG_LEVEL_COLORS[entry.level]}`}>
                  {entry.level}
                </span>
                <span className="shrink-0 text-surface-500 w-24 truncate">
                  [{entry.category}]
                </span>
                <span className="flex-1 text-surface-700 break-all">
                  {entry.message}
                </span>
                {(entry.data || entry.error) && (
                  <Icon
                    name={expanded.has(entry.id) ? 'chevronDown' : 'chevronRight'}
                    size={12}
                    className="shrink-0 text-surface-400 mt-0.5"
                  />
                )}
              </div>

              {expanded.has(entry.id) && (entry.data || entry.error) && (
                <div className="px-3 pb-2 ml-[180px]">
                  {entry.data !== undefined && entry.data !== null && (
                    <pre className="text-surface-600 bg-white/50 p-2 rounded overflow-x-auto">
                      {typeof entry.data === 'string' 
                        ? entry.data 
                        : JSON.stringify(entry.data, null, 2)}
                    </pre>
                  )}
                  {entry.error && (
                    <pre className="text-red-600 bg-red-50 p-2 rounded mt-1 overflow-x-auto">
                      {entry.error instanceof Error 
                        ? (entry.error.stack || entry.error.message)
                        : String(entry.error)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
