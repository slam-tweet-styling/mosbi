import { coordinator, wasmConnector } from '@uwdata/vgplot';
import type { DataSourceType, TableInfo, ColumnInfo } from '@/types';
import { logger, LogCategories } from '@/core/logger';

export interface MosaicConnectorOptions {
  type: DataSourceType;
  url?: string;
  port?: number;
}

class MosaicConnectorService {
  private initialized = false;
  private connectorType: DataSourceType = 'wasm';
  private connector: ReturnType<typeof wasmConnector> | null = null;

  async initialize(options: MosaicConnectorOptions = { type: 'wasm' }): Promise<void> {
    if (this.initialized) {
      logger.debug(LogCategories.Mosaic, 'Connector already initialized, skipping');
      return;
    }

    const endTimer = logger.time(LogCategories.Mosaic, 'Initialize connector');
    logger.info(LogCategories.Mosaic, `Initializing connector with type: ${options.type}`, options);

    try {
      const mc = coordinator();
      
      switch (options.type) {
        case 'wasm':
          logger.debug(LogCategories.Mosaic, 'Creating WASM connector');
          this.connector = wasmConnector();
          mc.databaseConnector(this.connector);
          break;
        case 'socket':
          logger.warn(LogCategories.Mosaic, 'Socket connector not yet implemented, falling back to WASM');
          this.connector = wasmConnector();
          mc.databaseConnector(this.connector);
          break;
        case 'rest':
          logger.warn(LogCategories.Mosaic, 'REST connector not yet implemented, falling back to WASM');
          this.connector = wasmConnector();
          mc.databaseConnector(this.connector);
          break;
        default:
          logger.warn(LogCategories.Mosaic, `Unknown connector type: ${options.type}, falling back to WASM`);
          this.connector = wasmConnector();
          mc.databaseConnector(this.connector);
      }

      this.connectorType = options.type;
      this.initialized = true;
      logger.info(LogCategories.Mosaic, 'Connector initialized successfully', { type: this.connectorType });
      endTimer();
    } catch (err) {
      logger.error(LogCategories.Mosaic, 'Failed to initialize connector', err);
      throw err;
    }
  }

  async exec(query: string): Promise<void> {
    await this.ensureInitialized();
    const start = performance.now();
    logger.debug(LogCategories.Query, `Executing: ${query.slice(0, 100)}${query.length > 100 ? '...' : ''}`);
    
    try {
      const mc = coordinator();
      await mc.exec(query);
      const duration = performance.now() - start;
      logger.debug(LogCategories.Query, `Exec completed`, { duration: `${duration.toFixed(2)}ms` });
    } catch (err) {
      logger.error(LogCategories.Query, `Exec failed: ${query.slice(0, 100)}`, err);
      throw err;
    }
  }

  async query<T = unknown>(sql: string): Promise<T[]> {
    await this.ensureInitialized();
    const start = performance.now();
    logger.debug(LogCategories.Query, `Query: ${sql.slice(0, 150)}${sql.length > 150 ? '...' : ''}`);
    
    try {
      const mc = coordinator();
      const result = await mc.query(sql, { type: 'json' });
      const duration = performance.now() - start;
      const rowCount = Array.isArray(result) ? result.length : 0;
      logger.debug(LogCategories.Query, `Query completed`, { duration: `${duration.toFixed(2)}ms`, rows: rowCount });
      return result as T[];
    } catch (err) {
      logger.error(LogCategories.Query, `Query failed: ${sql.slice(0, 100)}`, err);
      throw err;
    }
  }

  async loadCSVFromText(tableName: string, csvText: string): Promise<void> {
    await this.ensureInitialized();
    const endTimer = logger.time(LogCategories.DataSource, `Load CSV text into table "${tableName}"`);
    
    try {
      // Parse CSV properly handling quoted values
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        const err = new Error('CSV must have header and at least one row');
        logger.error(LogCategories.DataSource, 'Invalid CSV format', err);
        throw err;
      }
      
      const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
      
      // Sample first 100 rows to infer types
      const sampleSize = Math.min(100, lines.length - 1);
      const sampleRows: string[][] = [];
      for (let i = 1; i <= sampleSize; i++) {
        sampleRows.push(parseCSVLine(lines[i]));
      }

      logger.info(LogCategories.DataSource, `Parsing CSV: ${headers.length} columns, ${lines.length - 1} rows`, { headers });

      // Infer column types from sample
      const columnTypes = headers.map((_, colIdx) => {
        let hasDouble = false;
        let allNumeric = true;
        
        for (const row of sampleRows) {
          const val = row[colIdx]?.replace(/^"|"$/g, '') ?? '';
          if (val === '') continue;
          
          const num = Number(val);
          if (isNaN(num)) {
            allNumeric = false;
            break;
          }
          if (val.includes('.')) {
            hasDouble = true;
          }
        }
        
        if (allNumeric) {
          return hasDouble ? 'DOUBLE' : 'BIGINT';
        }
        return 'VARCHAR';
      });

      const columnDefs = headers.map((h, i) => `"${h}" ${columnTypes[i]}`).join(', ');

      await this.exec(`DROP TABLE IF EXISTS "${tableName}"`);
      await this.exec(`CREATE TABLE "${tableName}" (${columnDefs})`);

      // Insert data in batches
      const batchSize = 1000;
      const totalRows = lines.length - 1;
      
      for (let i = 1; i <= totalRows; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, totalRows + 1);
        const valueStrings: string[] = [];
        
        for (let j = i; j < batchEnd; j++) {
          const row = parseCSVLine(lines[j]);
          const vals = row.map((v, idx) => {
            const cleanVal = v.replace(/^"|"$/g, '');
            const colType = columnTypes[idx];
            
            if (colType === 'BIGINT' || colType === 'DOUBLE') {
              return cleanVal === '' ? 'NULL' : cleanVal;
            }
            // Escape single quotes for VARCHAR
            return `'${cleanVal.replace(/'/g, "''")}'`;
          }).join(', ');
          valueStrings.push(`(${vals})`);
        }
        
        if (valueStrings.length > 0) {
          await this.exec(`INSERT INTO "${tableName}" VALUES ${valueStrings.join(', ')}`);
        }
        
        // Log progress for large files
        if (totalRows > 10000 && (i - 1) % 50000 === 0) {
          logger.debug(LogCategories.DataSource, `Inserted ${Math.min(i + batchSize - 1, totalRows)} / ${totalRows} rows`);
        }
      }
      
      logger.info(LogCategories.DataSource, `Table "${tableName}" created successfully`, { rows: totalRows });
      endTimer();
    } catch (err) {
      logger.error(LogCategories.DataSource, `Failed to load CSV into table "${tableName}"`, err);
      throw err;
    }
  }

  async loadCSV(tableName: string, url: string): Promise<void> {
    await this.ensureInitialized();
    logger.info(LogCategories.DataSource, `Loading CSV from URL into table "${tableName}"`, { url: url.slice(0, 100) });
    
    // For all URLs (including blob:), fetch content and parse manually
    // DuckDB WASM cannot directly read blob URLs or most remote URLs
    try {
      logger.debug(LogCategories.DataSource, `Fetching CSV from URL: ${url.slice(0, 80)}`);
      const response = await fetch(url);
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`);
        logger.error(LogCategories.DataSource, `Failed to fetch CSV: HTTP ${response.status}`, err);
        throw err;
      }
      const text = await response.text();
      logger.debug(LogCategories.DataSource, `Fetched ${text.length} bytes`);
      await this.loadCSVFromText(tableName, text);
    } catch (err) {
      logger.error(LogCategories.DataSource, `Failed to load CSV from ${url.slice(0, 80)}`, err);
      throw new Error(`Failed to load CSV: ${err instanceof Error ? err.message : err}`);
    }
  }

  async loadParquet(tableName: string, url: string): Promise<void> {
    await this.ensureInitialized();
    logger.info(LogCategories.DataSource, `Loading Parquet into table "${tableName}"`, { url });
    
    try {
      const query = `CREATE TABLE IF NOT EXISTS "${tableName}" AS SELECT * FROM read_parquet('${url}')`;
      await this.exec(query);
      logger.info(LogCategories.DataSource, `Table "${tableName}" created from Parquet`);
    } catch (err) {
      logger.error(LogCategories.DataSource, `Failed to load Parquet into "${tableName}"`, err);
      throw err;
    }
  }

  async loadJSON(tableName: string, url: string): Promise<void> {
    await this.ensureInitialized();
    logger.info(LogCategories.DataSource, `Loading JSON into table "${tableName}"`, { url });
    
    try {
      const query = `CREATE TABLE IF NOT EXISTS "${tableName}" AS SELECT * FROM read_json('${url}', auto_detect=true)`;
      await this.exec(query);
      logger.info(LogCategories.DataSource, `Table "${tableName}" created from JSON`);
    } catch (err) {
      logger.error(LogCategories.DataSource, `Failed to load JSON into "${tableName}"`, err);
      throw err;
    }
  }

  async getTables(): Promise<string[]> {
    await this.ensureInitialized();
    logger.debug(LogCategories.DataSource, 'Getting list of tables');
    
    const result = await this.query<{ name: string }>(`
      SELECT table_name as name 
      FROM information_schema.tables 
      WHERE table_schema = 'main'
    `);
    
    const tables = result.map((r) => r.name);
    logger.debug(LogCategories.DataSource, `Found ${tables.length} tables`, { tables });
    return tables;
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    await this.ensureInitialized();
    logger.debug(LogCategories.DataSource, `Getting info for table "${tableName}"`);
    
    try {
      const columns = await this.query<{ column_name: string; data_type: string; is_nullable: string }>(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `);

      const countResult = await this.query<{ count: number }>(`
        SELECT COUNT(*) as count FROM "${tableName}"
      `);

      const columnInfos: ColumnInfo[] = columns.map((col) => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
      }));

      const info: TableInfo = {
        name: tableName,
        columns: columnInfos,
        rowCount: countResult[0]?.count ?? 0,
      };
      
      logger.debug(LogCategories.DataSource, `Table "${tableName}" info`, { columns: columnInfos.length, rows: info.rowCount });
      return info;
    } catch (err) {
      logger.error(LogCategories.DataSource, `Failed to get info for table "${tableName}"`, err);
      throw err;
    }
  }

  async getTablePreview(tableName: string, limit = 100): Promise<Record<string, unknown>[]> {
    await this.ensureInitialized();
    logger.debug(LogCategories.DataSource, `Getting preview for table "${tableName}"`, { limit });
    return this.query(`SELECT * FROM "${tableName}" LIMIT ${limit}`);
  }

  async dropTable(tableName: string): Promise<void> {
    await this.ensureInitialized();
    logger.info(LogCategories.DataSource, `Dropping table "${tableName}"`);
    
    try {
      await this.exec(`DROP TABLE IF EXISTS "${tableName}"`);
      logger.info(LogCategories.DataSource, `Table "${tableName}" dropped`);
    } catch (err) {
      logger.error(LogCategories.DataSource, `Failed to drop table "${tableName}"`, err);
      throw err;
    }
  }

  getCoordinator() {
    return coordinator();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConnectorType(): DataSourceType {
    return this.connectorType;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

export const mosaicConnector = new MosaicConnectorService();
