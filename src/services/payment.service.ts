import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { PaymentContract, PaymentItem } from '../interfaces/payment.interface';

/**
 * Service for handling payment-related operations
 */
export class PaymentService {
    private static hanaService = new HanaService();
    private static sapService = new SapService(this.hanaService);

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

        // Group by DocEntry to get unique contracts
        const contractsMap = new Map<number, PaymentContract>();

        for (const inst of installments) {
            if (!contractsMap.has(inst.DocEntry)) {
                const items = this.parseItemsPairs(inst.itemsPairs);

                contractsMap.set(inst.DocEntry, {
                    id: inst.DocEntry.toString(),
                    mainItemName: this.getMostExpensiveItem(items),
                    allItems: items,
                    contractNumber: inst.DocNum.toString(),
                    cardName: inst.CardName,
                    docDate: inst.DocDate,
                    dueDate: inst.DocDueDate,
                    total: typeof inst.Total === 'string' ? parseFloat(inst.Total) : inst.Total,
                    totalPaid: typeof inst.TotalPaid === 'string' ? parseFloat(inst.TotalPaid) : inst.TotalPaid,
                    currency: inst.DocCur,
                    installments: []
                });
            }

            const instTotal = typeof inst.InstTotal === 'string' ? parseFloat(inst.InstTotal) : inst.InstTotal;
            const instPaid = typeof inst.InstPaidToDate === 'string' ? parseFloat(inst.InstPaidToDate) : inst.InstPaidToDate;

            contractsMap.get(inst.DocEntry)!.installments.push({
                id: inst.InstlmntID,
                dueDate: inst.InstDueDate,
                total: instTotal,
                paid: instPaid || 0,
                status: this.getPaymentStatus(instTotal, instPaid, inst.InstDueDate)
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
}
