/**
 * Treasury domain model types.
 */
export type TreasurySource = 'created' | 'bound';

export interface TreasuryDto {
  id: string;
  name: string;
  address: string;
  source: TreasurySource;
  saltNonce?: string;
  createdAt: string;
}

export interface TreasuryWorkspaceDto {
  treasuries: TreasuryDto[];
  activeTreasuryId: string | null;
}
