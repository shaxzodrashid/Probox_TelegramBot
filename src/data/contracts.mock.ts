/**
 * Mock data for user contracts.
 * Represents Apple products purchased from Probox.
 */

export interface Contract {
  id: string;
  itemName: string;
  contractNumber: string;
  purchaseDate: string;
  amount: number; // Price in UZS
}

export const mockContracts: Contract[] = [
  {
    id: '1',
    itemName: 'iPhone 15 Pro Max 256GB',
    contractNumber: 'PB-2025-001',
    purchaseDate: '2025-01-15',
    amount: 18500000,
  },
  {
    id: '2',
    itemName: 'MacBook Air M2 13"',
    contractNumber: 'PB-2025-002',
    purchaseDate: '2025-01-10',
    amount: 22000000,
  },
  {
    id: '3',
    itemName: 'iPad Pro 12.9" 128GB',
    contractNumber: 'PB-2025-003',
    purchaseDate: '2025-01-05',
    amount: 15000000,
  },
  {
    id: '4',
    itemName: 'Apple Watch Ultra 2',
    contractNumber: 'PB-2024-104',
    purchaseDate: '2024-12-20',
    amount: 12500000,
  },
  {
    id: '5',
    itemName: 'AirPods Pro 2nd Gen',
    contractNumber: 'PB-2024-105',
    purchaseDate: '2024-12-15',
    amount: 3500000,
  },
  {
    id: '6',
    itemName: 'iMac 24" M3',
    contractNumber: 'PB-2024-106',
    purchaseDate: '2024-11-28',
    amount: 28000000,
  },
  {
    id: '7',
    itemName: 'MacBook Pro 14" M3 Pro',
    contractNumber: 'PB-2024-107',
    purchaseDate: '2024-11-15',
    amount: 35000000,
  },
  {
    id: '8',
    itemName: 'iPhone 15 128GB',
    contractNumber: 'PB-2024-108',
    purchaseDate: '2024-10-30',
    amount: 14500000,
  },
  {
    id: '9',
    itemName: 'iPad Air 11" 256GB',
    contractNumber: 'PB-2024-109',
    purchaseDate: '2024-10-20',
    amount: 11000000,
  },
  {
    id: '10',
    itemName: 'Apple Watch SE 2nd Gen',
    contractNumber: 'PB-2024-110',
    purchaseDate: '2024-09-15',
    amount: 4500000,
  },
  {
    id: '11',
    itemName: 'Mac Mini M2 Pro',
    contractNumber: 'PB-2024-111',
    purchaseDate: '2024-09-01',
    amount: 19500000,
  },
  {
    id: '12',
    itemName: 'AirPods Max',
    contractNumber: 'PB-2024-112',
    purchaseDate: '2024-08-20',
    amount: 8000000,
  },
  {
    id: '13',
    itemName: 'HomePod 2nd Gen',
    contractNumber: 'PB-2024-113',
    purchaseDate: '2024-08-10',
    amount: 5500000,
  },
  {
    id: '14',
    itemName: 'Apple TV 4K 128GB',
    contractNumber: 'PB-2024-114',
    purchaseDate: '2024-07-25',
    amount: 2800000,
  },
  {
    id: '15',
    itemName: 'Magic Keyboard with Touch ID',
    contractNumber: 'PB-2024-115',
    purchaseDate: '2024-07-10',
    amount: 2200000,
  },
];

/**
 * Get paginated contracts
 * @param page - Page number (1-indexed)
 * @param pageSize - Number of items per page
 * @returns Paginated contracts with metadata
 */
export const getPaginatedContracts = (page: number, pageSize: number = 10) => {
  const totalItems = mockContracts.length;
  const totalPages = Math.ceil(totalItems / pageSize);
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
