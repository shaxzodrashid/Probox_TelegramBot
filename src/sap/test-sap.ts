import 'dotenv/config';
import { HanaService } from './hana.service';
import { SapService } from './sap-hana.service';
import { logger } from '../utils/logger';

/**
 * 🚀 Manual Test Function
 * 
 * This script allows you to test the SapService independently.
 * It loads environment variables from your .env file.
 */
async function testSapService() {
  const hanaService = new HanaService();
  const sapService = new SapService(hanaService);

  try {
    // 📝 TEST 1: Business Partner by Phone
    const testPhoneNumber = '+998903367448'; 
    logger.info(`🔍 [TEST] Fetching business partner for: ${testPhoneNumber}`);
    
    const bpResults = await sapService.getBusinessPartnerByPhone(testPhoneNumber);
    
    if (bpResults.length === 0) {
      logger.info('⚠️ No business partner found for this phone number.');
    } else {
      logger.info('✅ Found Business Partners:');
      logger.table(bpResults);
      
      // 📝 TEST 2: Purchases by CardCode (using the first found BP)
      const testCardCode = bpResults[0].CardCode;
      logger.info(`🔍 [TEST] Fetching purchases for CardCode: ${testCardCode}`);
      
      const purchaseResults = await sapService.getBPpurchasesByCardCode(testCardCode);
      
      if (purchaseResults.length === 0) {
        logger.info('⚠️ No purchases found for this CardCode.');
      } else {
        logger.info('✅ Found Purchases/Installments:');
        logger.table(purchaseResults);
      }
    }
  } catch (error) {
    logger.error('❌ SAP Test Failed:', error instanceof Error ? error.message : error);
  }
}

// Execute the test
testSapService();
