import express from "express";
import { validationResult } from "express-validator";
import { transferMoney,listRecentTransactionsController,listDlqController } from "../controllers/transactionController.controller.js";
import { validateTransfer } from "../middleware/transfervalidate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getTransactionController } from "../controllers/transactionController.controller.js";
import { listNotificationsController } from "../controllers/notificationController.controller.js";

const router = express.Router();

router.post("/transfers", validateTransfer, (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(
            new ApiResponse(400, "Validation error", errors.array())
        );
    }
    next();
}, asyncHandler(transferMoney));
router.get("/transfers/:transactionId",asyncHandler(getTransactionController))
router.get("/debug/transactions",asyncHandler(listRecentTransactionsController))
router.get("/monitoring/dlq",asyncHandler(listDlqController))
router.get("/monitoring/notifications", asyncHandler(listNotificationsController));
export default router;
