export interface ISapItem {
  IMEI?: string;
  ItemCode: string;
  WhsCode: string;
  OnHand: number;
  ItemName: string;
  ItemGroupCode: number;
  ItemGroupName: string;
  U_Color?: string;
  U_Condition?: string;
  U_Model?: string;
  U_DeviceType?: string;
  U_Memory?: string;
  U_Sim_type?: string;
  U_PROD_CONDITION?: string;
  WhsName: string;
  SalePrice: number;
  PurchasePrice?: number;
}

export interface ISupportItemAvailabilityItem {
  imei: string | null;
  item_code: string;
  item_name: string;
  store_code: string;
  store_name: string;
  on_hand: number;
  sale_price: number | null;
  item_group_name: string;
  model: string | null;
  device_type: string | null;
  color: string | null;
  memory: string | null;
  condition: string | null;
  sim_type: string | null;
}
