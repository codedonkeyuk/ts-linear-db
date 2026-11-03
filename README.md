# ts-linear-db

This library handles database schema updates using the Linear Delta Pattern.
Traditional database migration frameworks often allow branch merges, asynchronous version numbers (like timestamps), or complex dependency graphs. In contrast, the Linear Delta Pattern enforces a strict, single-file sequential chain of micro-updates.

## Core Concepts

• Strict Monotonic Sequencing (v1, v2, v3): Every update is assigned a sequential, contiguous integer version. If your database is at version 4, the only valid next update is exactly version 5. Missing, skipped, or out-of-order steps are strictly forbidden.
• Atomic Deltas: Each migration script represents a single immutable "delta"—the absolute difference between state A and state B.
• State Determinism: Because the execution chain is linear and sequential, any database instance upgraded to version N is guaranteed to have the exact same structural schema, regardless of when or where the migration was executed.

**This code is still early doors, I will test it as I use it in other libraries, so be cautious.**

## Commands

| code                   | description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `npm install`          | install dependencies                                                            |
| `nvm use`              | use node version specified in projects .nvmrc file. (NVM needs installing)      |
| `npm run test`         | run node:test library                                                           |
| `npm run coverage`     | runs node test coverage report                                                  |
| `npm run clean`        | clean project using prettier                                                    |
| `npm run validate`     | validate code using typescript compiler. Does not generate files                |
| `npm run db -- status` | Print your file list and verify sequence numbers without opening database pools |
| `npm run db -- 4`      | Run your raw update sequence to point 4                                         |

## Build the database

- Update `database.json` with your database settings.
- Call `npm run db -- 4` to build database to specific version, in this case version 4
