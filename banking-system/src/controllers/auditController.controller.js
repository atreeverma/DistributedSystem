import {
    listAuditLogs,
    listAuditLogsByTransaction,
    listAuditLogsByAction
} from "../repositories/auditRepository.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export async function listAuditLogsController(req, res) {
    const { transactionId, action, limit } = req.query;

    let logs;

    if (transactionId) {
        logs = await listAuditLogsByTransaction(transactionId, limit);
    } else if (action) {
        logs = await listAuditLogsByAction(action, limit);
    } else {
        logs = await listAuditLogs(limit);
    }

    return res.status(200).json(
        new ApiResponse(200, "Audit logs fetched", {
            count: logs.length,
            logs
        })
    );
}