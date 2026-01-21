import 'dotenv/config';
import { HanaService } from './hana.service';
import { SapService } from './sap-hana.service';

/**
 * 🚀 Manual Test Function
 * 
 * This script allows you to test the SapService independently.
 * It loads environment variables from your .env file.
 */
async function testSapService() {
  const hanaService = new HanaService();
  const sapService = new SapService(hanaService);

  // 📝 PLACEHOLDER: Enter the phone number to test here
  const testPhoneNumber = '+998903367448'; 

  console.log(`🔍 [TEST] Fetching business partner for: ${testPhoneNumber}`);

  try {
    const results = await sapService.getBusinessPartnerByPhone(testPhoneNumber);
    
    if (results.length === 0) {
      console.log('⚠️ No business partner found for this phone number.');
    } else {
      console.log('✅ Found Business Partners:');
      console.table(results);
    }
  } catch (error) {
    console.error('❌ SAP Test Failed:', error instanceof Error ? error.message : error);
  }
}

// Execute the test
testSapService();
