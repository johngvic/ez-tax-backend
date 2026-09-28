export enum TaxCalculationType {
  ExclusaoPisCofins = 'exclusao-pis-cofins',
  ExclusaoIssqn     = 'exclusao-issqn', 
  RevisaoPisCofins  = 'revisao-pis-cofins',
}

export enum TaxCalculationStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  WaitingReview = 'WAITING_REVIEW',
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
  /** Motivo da falha (ex.: WORKSHEET_HEADER_MISMATCH); só existe com status FAILED */
  errorReason?: string;
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
  /** v2+: alinhado com sourceRows — edição sofrida pela natureza de origem antes da unificação (ou null). */
  sourceEdits?: (CalculationEdit | null)[];
  /** v2+: alinhado com sourceRows — true quando a natureza de origem foi adicionada manualmente. */
  sourceIsManual?: boolean[];
  recoveredBalance: number;
  riskLevel?: RiskLevel;
}

export interface RowSnapshot {
  label: string;
  values: number[];
  recoveredBalance: number;
  riskLevel?: RiskLevel;
}

export interface CalculationManualInsertion extends RowSnapshot {
  /** v2+: nome da unificação em que a natureza adicionada entrou. */
  mergedInto?: string;
}

export interface CalculationEdit {
  rowId: string;
  before: RowSnapshot;
  after: RowSnapshot;
}

/** Linha da tela de refinamento, como o front a mantém (unificações carregam as linhas de origem em `parts`). */
export interface RefinementStateRow {
  rowId: string;
  label: string;
  values: number[];
  merged: boolean;
  originalIndexes: number[];
  parts?: RefinementStateRow[];
  recoveredBalance?: number;
  grossValues?: number[];
  riskLevel?: RiskLevel;
  isManual?: boolean;
}

/** Estado restaurável da tela de refinamento (v2): permite reabrir o cálculo para edição. */
export interface RefinementState {
  rows: RefinementStateRow[];
  deletedRows: RefinementStateRow[];
  edits: Record<string, CalculationEdit>;
}

export interface ReviewedCalculationAudit {
  /** Ausente nos refinamentos antigos (v1), que só podem ser visualizados. */
  version?: number;
  importedCount?: number;
  merges: CalculationMerge[];
  manualInsertions: CalculationManualInsertion[];
  edits: CalculationEdit[];
  excludedRows: ReportDataRow[];
  state?: RefinementState;
}

export interface ReviewedCalculation {
  reportTable: ReportTableRow[];
  audit: ReviewedCalculationAudit;
}

export interface SaveCalculationRefinementsRequest extends ReviewedCalculation {
  styled: boolean;
  cnpj: string;
}
