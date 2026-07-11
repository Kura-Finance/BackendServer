export interface PrivyActiveUsersSummary {
  totalUsers: number;
  activeUsers: number;
  periodFrom: string;
  periodTo: string;
  lastSyncedAt: string | null;
}
