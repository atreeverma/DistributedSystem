import { pool } from "../config/db.js";

export async function getAccountById(client, id) {
    const res = await client.query(
        "SELECT * FROM accounts WHERE id = $1",
        [id]
    );
    return res.rows[0];
}