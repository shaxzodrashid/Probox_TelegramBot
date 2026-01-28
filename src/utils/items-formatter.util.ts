/**
 * Formats a raw itemsPairs string from SAP into a human-readable list.
 * 
 * Example: "CODE1::Item 1||CODE2::Item 2" 
 * Returns: "Item 1 va Item 2" (for uz)
 * 
 * Example: "CODE1::Item 1||CODE2::Item 2||CODE3::Item 3"
 * Returns: "Item 1, Item 2 va Item 3" (for uz)
 */
export function formatItemsList(itemsPairs: string): string {
  if (!itemsPairs) return '';

  const pairs = itemsPairs.split('||');
  const items = pairs
    .map(pair => {
      const parts = pair.split('::');
      return {
        code: parts[0]?.trim() || '',
        name: parts[1]?.trim() || (parts[0]?.trim() || ''),
        price: parseFloat(parts[2]) || 0
      };
    })
    .filter(item => item.name);

  if (items.length === 0) return '';

  // Find the most expensive item
  const mostExpensive = items.reduce((prev, current) =>
    (prev.price > current.price) ? prev : current
  );

  return mostExpensive.name;
}
