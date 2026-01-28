import { formatItemsList } from './items-formatter.util';
import { logger } from './logger';

const testCases = [
    {
        name: "Multiple items, one more expensive",
        input: "APPLE1883::USB iPhone 15 uchun::0.000000||APPLE2016::iphone 16 pro max 256gb desert::1640.060000",
        expected: "iphone 16 pro max 256gb desert"
    },
    {
        name: "Multiple items, first is more expensive",
        input: "ITEM1::Expensive item::500.00||ITEM2::Cheap item::10.00",
        expected: "Expensive item"
    },
    {
        name: "Single item",
        input: "ONLY1::Only item::100.00",
        expected: "Only item"
    },
    {
        name: "Old format (no price)",
        input: "OLD1::Old item",
        expected: "Old item"
    },
    {
        name: "Empty input",
        input: "",
        expected: ""
    }
];

logger.info("🚀 Starting verification of formatItemsList...\n");

let failedCount = 0;

testCases.forEach((tc, index) => {
    const result = formatItemsList(tc.input);
    const passed = result === tc.expected;

    if (passed) {
        logger.info(`✅ TEST ${index + 1}: ${tc.name} PASSED`);
    } else {
        logger.info(`❌ TEST ${index + 1}: ${tc.name} FAILED`);
        logger.info(`   Input:    ${tc.input}`);
        logger.info(`   Expected: ${tc.expected}`);
        logger.info(`   Actual:   ${result}`);
        failedCount++;
    }
});

logger.info(`\n📊 Results: ${testCases.length - failedCount}/${testCases.length} passed.`);

if (failedCount > 0) {
    process.exit(1);
}
