export interface Installment {
  id: number;
  dueDate: string;
  total: number;
  paid: number;
  status: string;
}

export interface Contract {
  id: string;
  itemName: string;
  contractNumber: string;
  purchaseDate: string;
  dueDate: string;
  totalAmount: number;
  totalPaid: number;
  cardName: string;
  currency: string;
  installments: Installment[];
}

export const mockContracts: Contract[] = [];

/**
 * Get paginated contracts
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of items per page
 * @returns Paginated contracts with metadata
 */
export const getPaginatedContracts = (page: number, pageSize: number = 10) => {
  const totalItems = mockContracts.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const items = mockContracts.slice(startIndex, endIndex);

  return {
    items,
    currentPage,
    totalPages,
    totalItems,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
};
