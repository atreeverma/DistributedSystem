import express from 'express';
import { createTask } from "../controllers/taskController"

const router = express.Router();

router.post('/task',createTask);

export default router;