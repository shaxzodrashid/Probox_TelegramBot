import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function checkItems() {
  const sapService = new SapService(new HanaService());
  
  logger.info('🚀 Checking latest 20 items from SAP HANA...');
  
  try {
    const result = await sapService.getItems({
      limit: 20,
      offset: 0,
    });
    
    logger.info(`✅ Found ${result.data.length} items (Total: ${result.total})`);
    
    if (result.data.length > 0) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      logger.warn('⚠️ No items found');
    }
  } catch (error) {
    logger.error('❌ Failed to fetch items', error);
  }
}

checkItems().catch(console.error);
