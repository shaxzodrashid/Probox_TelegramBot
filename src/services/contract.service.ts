import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { formatItemsList } from '../utils/items-formatter.util';
import { Contract } from '../data/contracts.mock';

export class ContractService {
  private static hanaService = new HanaService();
  private static sapService = new SapService(this.hanaService);

  /**
   * Fetches contracts for a specific CardCode from SAP.
   * Groups installments by DocEntry to represent unique contracts.
   */
  static async getContractsByCardCode(cardCode: string): Promise<Contract[]> {
    const installments = await this.sapService.getBPpurchasesByCardCode(cardCode);

    // Group by DocEntry to get unique contracts
    const contractsMap = new Map<number, Contract>();

    for (const inst of installments) {
      if (!contractsMap.has(inst.DocEntry)) {
        contractsMap.set(inst.DocEntry, {
          id: inst.DocEntry.toString(),
          itemName: formatItemsList(inst.itemsPairs),
          contractNumber: inst.DocNum.toString(),
          purchaseDate: inst.DocDate,
          dueDate: inst.DocDueDate,
          totalAmount: inst.Total,
          totalPaid: inst.TotalPaid,
          cardName: inst.CardName,
          currency: inst.DocCur,
          installments: []
        });
      }

      contractsMap.get(inst.DocEntry)!.installments.push({
        id: inst.InstlmntID,
        dueDate: inst.InstDueDate,
        total: inst.InstTotal,
        paid: inst.InstPaidToDate || 0,
        status: inst.InstStatus
      });
    }

    // Convert map to array, sort by DocEntry (id) descending to show newest first, and return
    return Array.from(contractsMap.values()).sort((a, b) => parseInt(b.id) - parseInt(a.id));
  }

  /**
   * Paginates an array of contracts.
   */
  static paginateContracts(contracts: Contract[], page: number, pageSize: number = 10) {
    const totalItems = contracts.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const items = contracts.slice(startIndex, endIndex);

    return {
      items,
      currentPage,
      totalPages,
      totalItems,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    };
  }
}
