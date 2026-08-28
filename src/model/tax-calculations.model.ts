export enum TaxCalculationType {
  ExclusaoPisCofins = 'exclusao-pis-cofins',
  ExclusaoIssqn     = 'exclusao-issqn', 
  RevisaoPisCofins  = 'revisao-pis-cofins',
}

export enum TaxCalculationStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

export interface TaxCalculation {
  calculationId: string;
  status: TaxCalculationStatus;
  pdfUrl?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt?: string;
  cnpj?: string;
  calculationType: TaxCalculationType;
  styled?: boolean;
}

export interface TaxCalculationResponse {
  data: TaxCalculation[];
  nextCursor?: string;
  hasNext: boolean;
}

export type ReportTableRow = (string | number)[];
export type ReportDataRow = [label: string, ...values: number[]];

export interface CalculationMerge {
  resultLabel: string;
  resultValues: number[];
  sourceRows: ReportDataRow[];
  recoveredBalance: number;
}

export interface ReviewedCalculation {
  reportTable: ReportTableRow[];
  merges: CalculationMerge[];
  excludedRows: ReportDataRow[];
}

export interface SaveCalculationRefinementsRequest extends ReviewedCalculation {
  styled: boolean;
  cnpj: string;
}
