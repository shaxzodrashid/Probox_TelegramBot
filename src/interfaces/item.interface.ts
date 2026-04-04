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
