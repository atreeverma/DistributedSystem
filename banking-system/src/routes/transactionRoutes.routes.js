import express from "express";
import { validationResult } from "express-validator";
import { transferMoney } from "../controllers/transactionController.controller.js";
import { validateTransfer } from "../middleware/transfervalidate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const router = express.Router();

router.post("/transfer", validateTransfer, (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(
            new ApiResponse(400, "Validation error", errors.array())
        );
    }
    next();
}, asyncHandler(transferMoney));

export default router;
