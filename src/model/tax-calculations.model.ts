export enum TaxCalculationType {
  ExclusaoPisCofins = 'EXCLUSAO_PIS_COFINS',
}

export enum ExclusaoPisCofinsStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

export interface ExclusaoPisCofinsCalculationResponse {
  calculationId: string;
  status: ExclusaoPisCofinsStatus;
  pdfUrl?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt?: string;
  cnpj?: string;
  type: TaxCalculationType;
}
