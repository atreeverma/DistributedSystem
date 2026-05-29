import express from "express"
import { createWalletController,getWalletController } from "../controllers/walletController.controller.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const router = express.Router()

router.post("/wallets",asyncHandler(createWalletController))
router.get("/wallets/:userId",asyncHandler(getWalletController))

export default router