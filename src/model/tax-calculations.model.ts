export enum TaxCalculationType {
  ExclusaoPisCofins = 'EXCLUSAO_PIS_COFINS',
  RevisaoPisCofins  = 'REVISAO_PIS_COFINS'
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
}

export interface TaxCalculationResponse {
  data: TaxCalculation[];
  nextCursor?: string;
  hasNext: boolean;
}
