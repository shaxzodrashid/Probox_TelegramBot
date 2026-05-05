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
  DocTotal: number;
  DocTotalFC: number;
  Total: number;
  TotalCurrency?: string;
  TotalPaid: number;
  TotalPaidCurrency?: string;
  InstlmntID: number;
  InstDueDate: string;
  InstTotal: number;
  InstCurrency?: string;
  InstPaidSys?: number;
  InstPaidToDate?: number;
  InstStatus: string;
  InstFullyPaidDate?: string;
  itemsPairs: string;
}
