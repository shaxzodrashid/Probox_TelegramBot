import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { formatItemsList } from '../utils/items-formatter.util';
import { Contract } from '../data/contracts.mock';
import { convertAmountForDisplay } from '../utils/currency-conversion.util';
import { logger } from '../utils/logger';

interface SapLookupIdentifiers {
  cardCode?: string;
  jshshir?: string;
}

export class ContractService {
  private static hanaService = new HanaService();
  private static sapService = new SapService(this.hanaService);
  private static logger = logger;

  private static getContractNumber(inst: { DocNum: number | string }): string {
    return String(inst.DocNum).trim();
  }

  /**
   * Fetches contracts for a specific CardCode from SAP.
   * Groups installments by DocEntry to represent unique contracts.
   */
  static async getContractsByCardCode(cardCode: string): Promise<Contract[]> {
    return this.getContractsByIdentifiers({ cardCode });
  }

  static async getContractsByIdentifiers({
    cardCode,
    jshshir,
  }: SapLookupIdentifiers): Promise<Contract[]> {
    const installments = await this.getInstallmentsByIdentifiers({ cardCode, jshshir });
    const usdToUzsRate = await this.getUsdToUzsRate();

    // Group by DocEntry to get unique contracts
    const contractsMap = new Map<number, Contract>();

    for (const inst of installments) {
      const sourceCurrency = (inst.DocCur || 'UZS').trim().toUpperCase();
      const totalAmount = convertAmountForDisplay(inst.Total, sourceCurrency, usdToUzsRate);
      const totalPaid = convertAmountForDisplay(inst.TotalPaid, sourceCurrency, usdToUzsRate);

      if (!contractsMap.has(inst.DocEntry)) {
        contractsMap.set(inst.DocEntry, {
          id: inst.DocEntry.toString(),
          itemName: formatItemsList(inst.itemsPairs),
          contractNumber: this.getContractNumber(inst),
          purchaseDate: inst.DocDate,
          dueDate: inst.DocDueDate,
          totalAmount: totalAmount.amount,
          totalPaid: totalPaid.amount,
          cardName: inst.CardName,
          currency: totalAmount.currency,
          sourceCurrency,
          displayCurrency: totalAmount.currency,
          installments: [],
        });
      }

      const installmentTotal = convertAmountForDisplay(
        inst.InstTotal,
        sourceCurrency,
        usdToUzsRate,
      ).amount;
      const installmentPaid = convertAmountForDisplay(
        inst.InstPaidToDate,
        sourceCurrency,
        usdToUzsRate,
      ).amount;

      contractsMap.get(inst.DocEntry)!.installments.push({
        id: inst.InstlmntID,
        dueDate: inst.InstDueDate,
        total: installmentTotal,
        paid: installmentPaid || 0,
        status: inst.InstStatus,
      });
    }

    // Convert map to array, sort by DocEntry (id) descending to show newest first, and return
    return Array.from(contractsMap.values()).sort((a, b) => parseInt(b.id) - parseInt(a.id));
  }

  private static async getInstallmentsByIdentifiers({ cardCode, jshshir }: SapLookupIdentifiers) {
    const normalizedJshshir = jshshir?.trim();
    const normalizedCardCode = cardCode?.trim();

    if (normalizedJshshir) {
      try {
        const partners = await this.sapService.getBusinessPartnerByJshshir(normalizedJshshir);
        const matchedCardCode = partners[0]?.CardCode?.trim();

        if (matchedCardCode) {
          this.logger.info(
            `[CONTRACTS] Using jshshir ${normalizedJshshir} resolved to CardCode ${matchedCardCode}`,
          );
          return await this.sapService.getBPpurchasesByCardCode(matchedCardCode);
        }

        this.logger.warn(
          `[CONTRACTS] No SAP business partner found for jshshir ${normalizedJshshir}; falling back to CardCode`,
        );
      } catch (error) {
        if (!normalizedCardCode) {
          throw error;
        }

        this.logger.warn(
          `[CONTRACTS] jshshir lookup failed for ${normalizedJshshir}; falling back to CardCode`,
          error,
        );
      }
    }

    if (!normalizedCardCode) {
      return [];
    }

    return this.sapService.getBPpurchasesByCardCode(normalizedCardCode);
  }

  private static async getUsdToUzsRate(): Promise<number | null> {
    try {
      return await this.sapService.getLatestExchangeRate('UZS');
    } catch (error) {
      this.logger.warn(
        '⚠️ [CONTRACTS] Falling back to source currency because USD/UZS rate is unavailable',
        error,
      );
      return null;
    }
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
