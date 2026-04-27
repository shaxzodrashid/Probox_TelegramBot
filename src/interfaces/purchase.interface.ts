export interface IPurchaseInstallment {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName: string;
  Phone1?: string | null;
  Phone2?: string | null;
  Cellular?: string | null;
  DocDate: string;
  DocDueDate: string;
  DocCur: string;
  Total: number;
  TotalPaid: number;
  InstlmntID: number;
  InstDueDate: string;
  InstTotal: number;
  InstPaidToDate: number;
  InstStatus: string;
  InstFullyPaidDate?: string;
  itemsPairs: string;
}
