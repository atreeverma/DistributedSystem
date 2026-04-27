import { body } from 'express-validator';

export const validateTransfer = [
    body("fromAccount").isString().notEmpty().withMessage("From account required"),
    body("toAccount").isString().notEmpty().withMessage("To account required"),
    body("amount").isFloat({min: 0.01}).withMessage("Amount must be positive")
]