export interface IPurchaseInstallment {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName: string;
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
  itemsPairs: string;
}
