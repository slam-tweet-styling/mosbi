export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  error?: Error;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  maxEntries: number;
  enableConsole: boolean;
  enableStorage: boolean;
}

type LogListener = (entry: LogEntry) => void;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#6b7280',
  info: '#3b82f6',
  warn: '#f59e0b',
  error: '#ef4444',
};

class LoggerService {
  private entries: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private config: LoggerConfig = {
    minLevel: 'debug',
    maxEntries: 500,
    enableConsole: true,
    enableStorage: false,
  };

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEntries(filter?: { level?: LogLevel; category?: string; limit?: number }): LogEntry[] {
    let result = [...this.entries];
    
    if (filter?.level) {
      const minLevel = LOG_LEVELS[filter.level];
      result = result.filter(e => LOG_LEVELS[e.level] >= minLevel);
    }
    
    if (filter?.category) {
      result = result.filter(e => e.category === filter.category);
    }
    
    if (filter?.limit) {
      result = result.slice(-filter.limit);
    }
    
    return result;
  }

  clear(): void {
    this.entries = [];
    this.notifyListeners({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level: 'info',
      category: 'Logger',
      message: 'Logs cleared',
    });
  }

  debug(category: string, message: string, data?: unknown): void {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, error?: Error | unknown, data?: unknown): void {
    const errorObj = error instanceof Error ? error : undefined;
    const errorData = error instanceof Error ? undefined : error;
    this.log('error', category, message, data ?? errorData, errorObj);
  }

  private log(level: LogLevel, category: string, message: string, data?: unknown, error?: Error): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      category,
      message,
      data,
      error,
    };

    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    // Console output
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Notify listeners
    this.notifyListeners(entry);
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString().split('T')[1].slice(0, 12);
    const prefix = `%c[${timestamp}] [${entry.category}]`;
    const style = `color: ${LOG_COLORS[entry.level]}; font-weight: bold;`;

    const args: unknown[] = [prefix, style, entry.message];
    
    if (entry.data !== undefined) {
      args.push(entry.data);
    }
    
    if (entry.error) {
      args.push(entry.error);
    }

    switch (entry.level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }
  }

  private notifyListeners(entry: LogEntry): void {
    this.listeners.forEach(listener => {
      try {
        listener(entry);
      } catch (err) {
        console.error('Logger listener error:', err);
      }
    });
  }

  // Performance timing helpers
  time(category: string, label: string): () => void {
    const start = performance.now();
    this.debug(category, `⏱️ Started: ${label}`);
    
    return () => {
      const duration = performance.now() - start;
      this.info(category, `⏱️ Completed: ${label}`, { duration: `${duration.toFixed(2)}ms` });
    };
  }

  // Query logging helper
  query(sql: string, duration?: number): void {
    const truncatedSql = sql.length > 200 ? sql.slice(0, 200) + '...' : sql;
    this.debug('Query', truncatedSql, duration ? { duration: `${duration.toFixed(2)}ms` } : undefined);
  }
}

export const logger = new LoggerService();

// Export categories for consistency
export const LogCategories = {
  App: 'App',
  Store: 'Store',
  Mosaic: 'Mosaic',
  Query: 'Query',
  Widget: 'Widget',
  DataSource: 'DataSource',
  UI: 'UI',
  Network: 'Network',
} as const;
