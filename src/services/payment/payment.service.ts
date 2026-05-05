import { SapService } from '../../sap/sap-hana.service';
import { HanaService } from '../../sap/hana.service';
import { PaymentContract, PaymentItem } from '../../interfaces/payment.interface';
import {
  getDocumentTotalByCurrency,
  getInstallmentDisplayCurrency,
  normalizeCurrencyCode,
  parseNumericAmount,
} from '../../utils/currency-conversion.util';
import { logger } from '../../utils/logger';

interface SapLookupIdentifiers {
  cardCode?: string;
  jshshir?: string;
}

/**
 * Service for handling payment-related operations
 */
export class PaymentService {
  private static hanaService = new HanaService();
  private static sapService = new SapService(this.hanaService);
  private static logger = logger;

  private static getContractNumber(inst: { DocNum: number | string }): string {
    return String(inst.DocNum).trim();
  }

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
      .map((pair) => {
        const parts = pair.split('::');
        return {
          code: parts[0]?.trim() || '',
          name: parts[1]?.trim() || parts[0]?.trim() || '',
          price: parseFloat(parts[2]) || 0,
        };
      })
      .filter((item) => item.name);
  }

  /**
   * Finds the most expensive item from the items list
   */
  private static getMostExpensiveItem(items: PaymentItem[]): string {
    if (items.length === 0) return '';

    const mostExpensive = items.reduce((prev, current) =>
      prev.price > current.price ? prev : current,
    );

    return mostExpensive.name;
  }

  /**
   * Determines the payment status based on amounts and due date
   */
  private static getPaymentStatus(
    instTotal: number,
    instPaidSys: number,
    instDueDate: string,
  ): 'paid' | 'incomplete' | 'overdue' | 'future' {
    const total = typeof instTotal === 'string' ? parseFloat(instTotal) : instTotal;
    const paid = typeof instPaidSys === 'string' ? parseFloat(instPaidSys) : instPaidSys;

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
    return this.getPaymentsByIdentifiers({ cardCode });
  }

  static async getPaymentsByIdentifiers({
    cardCode,
    jshshir,
  }: SapLookupIdentifiers): Promise<PaymentContract[]> {
    const installments = await this.getInstallmentsByIdentifiers({ cardCode, jshshir });

    // Group by DocEntry to get unique contracts
    const contractsMap = new Map<number, PaymentContract>();

    for (const inst of installments) {
      const sourceCurrency = normalizeCurrencyCode(inst.DocCur);
      const documentCurrency = normalizeCurrencyCode(inst.TotalCurrency || sourceCurrency);
      const documentCurrencyAmount = getDocumentTotalByCurrency(
        documentCurrency,
        inst.DocTotal,
        inst.DocTotalFC,
        inst.Total,
      );
      const totalPaid = parseNumericAmount(inst.TotalPaid);
      const totalPaidCurrency = normalizeCurrencyCode(inst.TotalPaidCurrency || documentCurrency);
      const items = this.parseItemsPairs(inst.itemsPairs);

      if (!contractsMap.has(inst.DocEntry)) {
        contractsMap.set(inst.DocEntry, {
          id: inst.DocEntry.toString(),
          mainItemName: this.getMostExpensiveItem(items),
          allItems: items,
          contractNumber: this.getContractNumber(inst),
          cardName: inst.CardName,
          docDate: inst.DocDate,
          dueDate: inst.DocDueDate,
          total: documentCurrencyAmount,
          totalPaid,
          totalPaidCurrency,
          currency: documentCurrency,
          sourceCurrency,
          displayCurrency: documentCurrency,
          docTotal: inst.DocTotal,
          docTotalFC: inst.DocTotalFC,
          installments: [],
        });
      }

      const instTotalRaw = parseNumericAmount(inst.InstTotal);
      const instPaidRaw = parseNumericAmount(inst.InstPaidToDate ?? inst.InstPaidSys);
      const installmentCurrency = normalizeCurrencyCode(
        inst.InstCurrency ||
          getInstallmentDisplayCurrency(sourceCurrency, instTotalRaw, documentCurrencyAmount),
      );

      contractsMap.get(inst.DocEntry)!.installments.push({
        id: inst.InstlmntID,
        dueDate: inst.InstDueDate,
        total: instTotalRaw,
        paid: instPaidRaw || 0,
        currency: installmentCurrency,
        status: this.getPaymentStatus(instTotalRaw, instPaidRaw, inst.InstDueDate),
      });
    }

    // Sort installments by due date and contracts by DocEntry (newest first)
    const contracts = Array.from(contractsMap.values());

    contracts.forEach((contract) => {
      contract.installments.sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );
    });

    return contracts.sort((a, b) => parseInt(b.id) - parseInt(a.id));
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
            `[PAYMENTS] Using jshshir ${normalizedJshshir} resolved to CardCode ${matchedCardCode}`,
          );
          return await this.sapService.getBPpurchasesByCardCode(matchedCardCode);
        }

        this.logger.warn(
          `[PAYMENTS] No SAP business partner found for jshshir ${normalizedJshshir}; falling back to CardCode`,
        );
      } catch (error) {
        if (!normalizedCardCode) {
          throw error;
        }

        this.logger.warn(
          `[PAYMENTS] jshshir lookup failed for ${normalizedJshshir}; falling back to CardCode`,
          error,
        );
      }
    }

    if (!normalizedCardCode) {
      return [];
    }

    return this.sapService.getBPpurchasesByCardCode(normalizedCardCode);
  }
}
