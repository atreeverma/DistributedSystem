import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
//A container is a lightweight, isolated environment that runs one process/service with its own dependencies, ports, and config — without installing everything globally on your OS.
const SCHEMA_PATH = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),//gets the directory name of the current file
    "../../schema.sql"//path to the schema.sql file
);

const SCHEMA_RETRY_ATTEMPTS = Number(process.env.SCHEMA_RETRY_ATTEMPTS) || 10;
const SCHEMA_RETRY_DELAY_MS = Number(process.env.SCHEMA_RETRY_DELAY_MS) || 2000;

function isTransientDbError(error) {
    return ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P03"].includes(error.code);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureDatabaseSchema() {
    const sql = await fs.readFile(SCHEMA_PATH, "utf8");//reads the schema.sql file

    for (let attempt = 1; attempt <= SCHEMA_RETRY_ATTEMPTS; attempt++) {
        try {
            await pool.query(sql);
            console.log("Database schema ensured");
            return;
        } catch (error) {
            if (!isTransientDbError(error) || attempt === SCHEMA_RETRY_ATTEMPTS) {
                throw error;
            }

            console.warn(
                `Database unavailable (attempt ${attempt}/${SCHEMA_RETRY_ATTEMPTS}), retrying in ${SCHEMA_RETRY_DELAY_MS}ms: ${error.message}`
            );
            await delay(SCHEMA_RETRY_DELAY_MS);
        }
    }
}
