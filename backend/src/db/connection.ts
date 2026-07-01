import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/family-team-app";

export async function connectDB() {
  const isSRV = MONGODB_URI.startsWith("mongodb+srv://");
  await mongoose.connect(MONGODB_URI, {
    ...(isSRV ? { tls: true } : {}),
    serverSelectionTimeoutMS: 5000
  });
  logger.info("Ansluten till MongoDB");
}
