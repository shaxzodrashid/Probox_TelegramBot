import { HanaService } from '../sap/hana.service';
import { loadSQL } from '../utils/sql-loader.utils';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
    const hana = new HanaService();
    let docEntry = process.argv[2];
    const schema = process.env.SAP_SCHEMA || 'PROBOX_PROD_3';
    
    try {
        if (!docEntry) {
            console.log('🔍 No DocEntry provided. Fetching the latest invoice from SAP to test...');
            const latestInvSql = `SELECT TOP 1 "DocEntry", "CardCode", "CardName", "DocNum" FROM ${schema}."OINV" ORDER BY "DocEntry" DESC`;
            const latest: any[] = await hana.executeOnce(latestInvSql);
            if (latest.length > 0) {
                docEntry = latest[0].DocEntry.toString();
                console.log(`✅ Found latest invoice: DocEntry ${docEntry} (Customer: ${latest[0].CardName})`);
            } else {
                console.error('❌ No invoices found in SAP.');
                process.exit(1);
            }
        }

        console.log(`\n--- 📦 [1/2] Fetching Installments for DocEntry: ${docEntry} ---`);
        const testInstSql = `
            SELECT T0."InstlmntID", T0."DueDate" as "InstDueDate", T0."InsTotalSy" as "InstTotal", T0."PaidSys" as "InstPaidSys", T0."Status" as "InstStatus", T1."DocCur" as "Currency"
            FROM ${schema}."INV6" T0
            INNER JOIN ${schema}."OINV" T1 ON T0."DocEntry" = T1."DocEntry"
            WHERE T0."DocEntry" = ?
            ORDER BY T0."InstlmntID" ASC
        `;
        
        const installments: any[] = await hana.executeOnce(testInstSql, [docEntry]);
        console.table(installments);

        console.log(`\n--- 💳 [2/2] Fetching Fully Paid Dates for DocEntry: ${docEntry} ---`);
        const paymentSql = loadSQL('sap/queries/test-get-inst-payment-dates.sql').replace(/{{schema}}/g, schema);
        const payments: any[] = await hana.executeOnce(paymentSql, [docEntry]);
        
        if (payments.length === 0) {
            console.log('No payments found for this invoice in RCT2/ORCT.');
        } else {
            console.table(payments);
            
            console.log('\n--- 🎯 Comparison (On-Time Analysis) ---');
            installments.forEach((inst: any) => {
                const pay = payments.find((p: any) => Number(p.RCT2InstID) === Number(inst.InstlmntID));
                
                const dueDate = new Date(inst.InstDueDate);
                const isPaid = Number(inst.InstPaidSys) >= Number(inst.InstTotal);
                
                let result = '';
                if (!isPaid) {
                    result = `❌ UNPAID (${inst.InstPaidSys} / ${inst.InstTotal} ${inst.Currency})`;
                } else if (!pay) {
                    result = `⚠️ PAID (but payment link not found in RCT2) - Total: ${inst.InstTotal} ${inst.Currency}`;
                } else {
                    const payDate = new Date(pay.FullyPaidDate as string);
                    const onTime = payDate <= dueDate;
                    result = onTime ? `✅ ON TIME (${inst.InstTotal} ${inst.Currency})` : `🚫 LATE (Paid: ${pay.FullyPaidDate}, Total: ${inst.InstTotal} ${inst.Currency})`;
                }
                
                console.log(`Installment #${inst.InstlmntID} (Due: ${inst.InstDueDate}): ${result}`);
            });
        }

    } catch (err) {
        console.error('❌ Error testing SAP connection:', err);
    }
}

main().catch(console.error);
