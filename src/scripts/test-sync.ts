import { SapSyncCron } from "../cron/sap-sync.cron";
import { logger } from "../utils/logger";
import dotenv from "dotenv";

dotenv.config();

async function runTest() {
    logger.info("Starting SAP sync script...");
    try {
        await SapSyncCron.init();
        logger.info("SAP sync script completed successfully");
    } catch (error) {
        logger.error("Failed to start SAP sync script", error);
    }
}

runTest();