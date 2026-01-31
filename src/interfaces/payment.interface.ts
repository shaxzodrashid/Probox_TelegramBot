/**
 * Payment installment details
 */
export interface PaymentInstallment {
    id: number;
    dueDate: string;
    total: number;
    paid: number;
    status: 'paid' | 'incomplete' | 'overdue' | 'future';
}

/**
 * Individual item in a payment contract
 */
export interface PaymentItem {
    code: string;
    name: string;
    price: number;
}

/**
 * Payment contract with installment schedule
 */
export interface PaymentContract {
    id: string;
    mainItemName: string;     // Most expensive item (for keyboard button)
    allItems: PaymentItem[];  // All items (for detail message)
    contractNumber: string;
    cardName: string;
    docDate: string;
    dueDate: string;
    total: number;
    totalPaid: number;
    currency: string;
    installments: PaymentInstallment[];
}
