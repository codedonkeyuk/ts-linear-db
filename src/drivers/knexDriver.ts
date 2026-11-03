import pkg from "knex";
import type { IDatabaseDriver, LinearDbConfig } from "../types.ts";

type KnexInstance = pkg.Knex;

export class KnexDriver implements IDatabaseDriver {
  private knex: KnexInstance;
  private config: LinearDbConfig;

  constructor(knexInstance: KnexInstance, config: LinearDbConfig) {
    this.knex = knexInstance;
    this.config = config;
  }

  async connect(): Promise<void> {
    await this.knex.raw("SELECT 1");
  }

  async disconnect(): Promise<void> {
    await this.knex.destroy();
  }

  async ensureMetadataTable(): Promise<void> {
    const { tableName, idColumn, versionColumn } = this.config;
    const hasTable = await this.knex.schema.hasTable(tableName);

    if (!hasTable) {
      await this.knex.schema.createTable(tableName, (table) => {
        table.integer(idColumn).primary().defaultTo(1);
        table.integer(versionColumn).notNullable().defaultTo(0);
        table.check(`${idColumn} = 1`);
      });

      await this.knex(tableName).insert({ [idColumn]: 1, [versionColumn]: 0 });
    }
  }

  async getCurrentVersion(): Promise<number> {
    const { tableName, idColumn, versionColumn } = this.config;
    const row = await this.knex(tableName)
      .where({ [idColumn]: 1 })
      .first();
    return row ? row[versionColumn] : 0;
  }

  async executeStep(sql: string, targetVersion: number): Promise<void> {
    const { tableName, idColumn, versionColumn } = this.config;

    await this.knex.transaction(async (trx) => {
      const statements = sql
        .split("\n")
        .map((line) => line.replace(/--.*$/, "").trim())
        .join(" ")
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      for (const statement of statements) {
        await trx.raw(statement);
      }

      await trx(tableName)
        .where({ [idColumn]: 1 })
        .update({ [versionColumn]: targetVersion });
    });
  }
}
