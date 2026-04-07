import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { PaymentContract, PaymentItem } from '../interfaces/payment.interface';
import { convertAmountForDisplay, parseNumericAmount } from '../utils/currency-conversion.util';
import { logger } from '../utils/logger';

/**
 * Service for handling payment-related operations
 */
export class PaymentService {
    private static hanaService = new HanaService();
    private static sapService = new SapService(this.hanaService);
    private static logger = logger;

    /**
     * Parses the itemsPairs string from SAP into an array of PaymentItem
     * Format: "CODE1::Name1::Price1||CODE2::Name2::Price2"
     * Handles both ":: " and ": :" separator formats
     */
    private static parseItemsPairs(itemsPairs: string): PaymentItem[] {
        if (!itemsPairs) return [];

        // Normalize: convert ": :" to "::" to handle both formats
        const normalized = itemsPairs.replace(/: :/g, '::');

        const pairs = normalized.split('||');
        return pairs
            .map(pair => {
                const parts = pair.split('::');
                return {
                    code: parts[0]?.trim() || '',
                    name: parts[1]?.trim() || (parts[0]?.trim() || ''),
                    price: parseFloat(parts[2]) || 0
                };
            })
            .filter(item => item.name);
    }

    /**
     * Finds the most expensive item from the items list
     */
    private static getMostExpensiveItem(items: PaymentItem[]): string {
        if (items.length === 0) return '';

        const mostExpensive = items.reduce((prev, current) =>
            (prev.price > current.price) ? prev : current
        );

        return mostExpensive.name;
    }

    /**
     * Determines the payment status based on amounts and due date
     */
    private static getPaymentStatus(
        instTotal: number,
        instPaidToDate: number,
        instDueDate: string
    ): 'paid' | 'incomplete' | 'overdue' | 'future' {
        const total = typeof instTotal === 'string' ? parseFloat(instTotal) : instTotal;
        const paid = typeof instPaidToDate === 'string' ? parseFloat(instPaidToDate) : instPaidToDate;

        // Fully paid
        if (paid >= total) {
            return 'paid';
        }

        const dueDate = new Date(instDueDate);
        const now = new Date();

        // Future payment (not yet due)
        if (dueDate > now && paid === 0) {
            return 'future';
        }

        // Overdue or incomplete
        if (dueDate <= now && paid < total) {
            return paid > 0 ? 'incomplete' : 'overdue';
        }

        // Partial payment for future date
        if (paid > 0 && paid < total) {
            return 'incomplete';
        }

        return 'future';
    }

    /**
     * Fetches payment contracts for a specific CardCode from SAP.
     * Groups installments by DocEntry to represent unique contracts.
     */
    static async getPaymentsByCardCode(cardCode: string): Promise<PaymentContract[]> {
        const installments = await this.sapService.getBPpurchasesByCardCode(cardCode);
        const usdToUzsRate = await this.getUsdToUzsRate();

        // Group by DocEntry to get unique contracts
        const contractsMap = new Map<number, PaymentContract>();

        for (const inst of installments) {
            const sourceCurrency = (inst.DocCur || 'UZS').trim().toUpperCase();
            const totalDisplay = convertAmountForDisplay(inst.Total, sourceCurrency, usdToUzsRate);
            const totalPaidDisplay = convertAmountForDisplay(inst.TotalPaid, sourceCurrency, usdToUzsRate);
            const items = this.parseItemsPairs(inst.itemsPairs).map((item) => ({
                ...item,
                price: convertAmountForDisplay(item.price, sourceCurrency, usdToUzsRate).amount,
            }));

            if (!contractsMap.has(inst.DocEntry)) {
                contractsMap.set(inst.DocEntry, {
                    id: inst.DocEntry.toString(),
                    mainItemName: this.getMostExpensiveItem(items),
                    allItems: items,
                    contractNumber: inst.DocNum.toString(),
                    cardName: inst.CardName,
                    docDate: inst.DocDate,
                    dueDate: inst.DocDueDate,
                    total: totalDisplay.amount,
                    totalPaid: totalPaidDisplay.amount,
                    currency: totalDisplay.currency,
                    sourceCurrency,
                    displayCurrency: totalDisplay.currency,
                    installments: []
                });
            }

            const instTotalRaw = parseNumericAmount(inst.InstTotal);
            const instPaidRaw = parseNumericAmount(inst.InstPaidToDate);
            const instTotal = convertAmountForDisplay(instTotalRaw, sourceCurrency, usdToUzsRate).amount;
            const instPaid = convertAmountForDisplay(instPaidRaw, sourceCurrency, usdToUzsRate).amount;

            contractsMap.get(inst.DocEntry)!.installments.push({
                id: inst.InstlmntID,
                dueDate: inst.InstDueDate,
                total: instTotal,
                paid: instPaid || 0,
                status: this.getPaymentStatus(instTotalRaw, instPaidRaw, inst.InstDueDate)
            });
        }

        // Sort installments by due date and contracts by DocEntry (newest first)
        const contracts = Array.from(contractsMap.values());

        contracts.forEach(contract => {
            contract.installments.sort((a, b) =>
                new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
            );
        });

        return contracts.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    }

    private static async getUsdToUzsRate(): Promise<number | null> {
        try {
            return await this.sapService.getLatestExchangeRate('UZS');
        } catch (error) {
            this.logger.warn('⚠️ [PAYMENTS] Falling back to source currency because USD/UZS rate is unavailable', error);
            return null;
        }
    }
}
