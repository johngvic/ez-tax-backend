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

export type RiskLevel = 'low' | 'medium' | 'high';

export interface CalculationMerge {
  resultLabel: string;
  resultValues: number[];
  sourceRows: ReportDataRow[];
  recoveredBalance: number;
  riskLevel?: RiskLevel;
}

export interface RowSnapshot {
  label: string;
  values: number[];
  recoveredBalance: number;
  riskLevel?: RiskLevel;
}

export type CalculationManualInsertion = RowSnapshot;

export interface CalculationEdit {
  rowId: string;
  before: RowSnapshot;
  after: RowSnapshot;
}

export interface ReviewedCalculationAudit {
  merges: CalculationMerge[];
  manualInsertions: CalculationManualInsertion[];
  edits: CalculationEdit[];
  excludedRows: ReportDataRow[];
}

export interface ReviewedCalculation {
  reportTable: ReportTableRow[];
  audit: ReviewedCalculationAudit;
}

export interface SaveCalculationRefinementsRequest extends ReviewedCalculation {
  styled: boolean;
  cnpj: string;
}
