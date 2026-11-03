import { Knex } from "knex";

export interface LinearDbConfig {
  scriptsDir: string;
  tableName: string;
  idColumn: string;
  versionColumn: string;
}

export interface AppConfig {
  db: Knex.Config;
  engine: LinearDbConfig;
}

export interface IDatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ensureMetadataTable(): Promise<void>;
  getCurrentVersion(): Promise<number>;
  executeStep(sql: string, targetVersion: number): Promise<void>;
}

export interface UpdateScript {
  version: number;
  description: string;
  fileName: string;
  filePath: string;
}
