import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import pkg from "knex";
import { AgnosticLinearEngine } from "./engine.ts";
import { KnexDriver } from "./drivers/knexDriver.ts";
import type { AppConfig } from "./types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandArg = process.argv[2];

if (!commandArg) {
  console.error(
    "[ts-linear-db] Error: Missing command parameter. Usage: npm run update -- [status|<target_integer>]",
  );
  process.exit(1);
}

export async function run() {
  try {
    const configPath = path.join(__dirname, "../database.json");
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file missing at: ${configPath}`);
    }

    const rawConfig = fs.readFileSync(configPath, "utf8");
    const config: AppConfig = JSON.parse(rawConfig);

    config.engine.scriptsDir = path.resolve(
      path.dirname(configPath),
      config.engine.scriptsDir,
    );

    const isStatusCheck = commandArg.toLowerCase() === "status";
    const dbConnection = isStatusCheck ? null : pkg(config.db);
    const driver = dbConnection
      ? new KnexDriver(dbConnection, config.engine)
      : null;
    const engine = new AgnosticLinearEngine(driver!, config.engine);

    if (isStatusCheck) {
      console.log(
        "[ts-linear-db] Validating local script directory sequence...",
      );
      const scripts = engine.getAndValidateScripts();
      console.log(
        `[ts-linear-db] Success: Chain intact. Found ${scripts.length} valid sequence step files.`,
      );
      for (const script of scripts) {
        console.log(`  -> v${script.version}: ${script.description}`);
      }
      return;
    }

    const targetArg = parseInt(commandArg, 10);
    if (isNaN(targetArg)) {
      throw new Error(
        `Invalid command line parameter "${commandArg}". Expected "status" or an integer target version.`,
      );
    }

    await engine.updateToPoint(targetArg);
  } catch (error: any) {
    console.error("[ts-linear-db] Execution failed:", error.message || error);
    process.exit(1);
  }
}

if (process.argv[1] === __filename) {
  run().catch(() => process.exit(1));
}
