import * as fs from "fs";
import * as path from "path";
import type { IDatabaseDriver, UpdateScript, LinearDbConfig } from "./types.ts";

export class AgnosticLinearEngine {
  private driver: IDatabaseDriver;
  private config: LinearDbConfig;

  constructor(driver: IDatabaseDriver, config: LinearDbConfig) {
    this.driver = driver;
    this.config = config;
  }

  public getAndValidateScripts(): UpdateScript[] {
    const { scriptsDir } = this.config;

    if (!fs.existsSync(scriptsDir)) {
      throw new Error(
        `[ts-linear-db] Scripts directory does not exist at: ${scriptsDir}`,
      );
    }

    const files = fs.readdirSync(scriptsDir);
    const scripts: UpdateScript[] = [];
    const seenVersions = new Set<number>();

    for (const file of files) {
      const match = file.match(/^v(\d+)__(.*)\.sql$/);
      if (!match) {
        if (file.endsWith(".sql")) {
          console.log(
            `[ts-linear-db] Skipping non-conforming file name: "${file}". Expected style: v0001__description.sql`,
          );
        }
        continue;
      }

      const version = parseInt(match[1], 10);
      const description = match[2];

      if (seenVersions.has(version)) {
        throw new Error(
          `[ts-linear-db] Critical Collision: Duplicate version number found for version v${version}. Conflict file: "${file}"`,
        );
      }

      seenVersions.add(version);
      scripts.push({
        version,
        description,
        fileName: file,
        filePath: path.join(scriptsDir, file),
      });
    }

    return scripts.sort((a, b) => a.version - b.version);
  }

  async updateToPoint(targetVersion: number): Promise<void> {
    await this.driver.connect();
    await this.driver.ensureMetadataTable();

    const currentVersion = await this.driver.getCurrentVersion();
    console.log(
      `[ts-linear-db] Current State: v${currentVersion} | Target Destination: v${targetVersion}`,
    );

    if (currentVersion === targetVersion) {
      console.log("[ts-linear-db] Database matches the target version.");
      await this.driver.disconnect();
      return;
    }

    if (targetVersion < currentVersion) {
      await this.driver.disconnect();
      throw new Error(
        `[ts-linear-db] Downgrades are prohibited. Current version is v${currentVersion}, requested destination is v${targetVersion}`,
      );
    }

    const allScripts = this.getAndValidateScripts();
    const activeChain = allScripts.filter(
      (s) => s.version > currentVersion && s.version <= targetVersion,
    );

    const expectedStepCount = targetVersion - currentVersion;
    if (activeChain.length !== expectedStepCount) {
      const missingSteps: number[] = [];
      for (let i = currentVersion + 1; i <= targetVersion; i++) {
        if (!activeChain.some((s) => s.version === i)) {
          missingSteps.push(i);
        }
      }

      await this.driver.disconnect();
      throw new Error(
        `[ts-linear-db] Broken Chain: Missing sequential steps between v${currentVersion} and v${targetVersion}. Missing numbers: ${missingSteps.join(", ")}`,
      );
    }

    for (const step of activeChain) {
      console.log(`[ts-linear-db] Executing script: ${step.fileName}`);
      const sqlContent = fs.readFileSync(step.filePath, "utf8");

      try {
        await this.driver.executeStep(sqlContent, step.version);
        console.log(
          `[ts-linear-db] Successfully advanced to state: v${step.version}`,
        );
      } catch (err) {
        console.error(
          `[ts-linear-db] Execution aborted at v${step.version}. Subsequent updates cancelled.`,
        );
        await this.driver.disconnect();
        throw err;
      }
    }

    console.log(
      `[ts-linear-db] Target reached. Database anchored at point v${targetVersion}.`,
    );
    await this.driver.disconnect();
  }
}
