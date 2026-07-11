/**
 * 資產領域模型型別
 */
export interface AssetHistoryPoint {
    timestamp: Date;
    cashFlow: number;
    plaidInvestment: number;
    cryptoSpot: number;
    defiProtocol: number;
}
export interface AssetHistoryResponse {
    userId: string;
    cashFlow: number;
    lastRecordedTime: Date | null;
    history: AssetHistoryPoint[];
    summary: {
        cashFlow: {
            minValue: number;
            maxValue: number;
            averageValue: number;
            change: number;
            changePercent: number;
        };
        plaidInvestment: {
            minValue: number;
            maxValue: number;
            averageValue: number;
            change: number;
            changePercent: number;
        };
        cryptoSpot: {
            minValue: number;
            maxValue: number;
            averageValue: number;
            change: number;
            changePercent: number;
        };
        defiProtocol: {
            minValue: number;
            maxValue: number;
            averageValue: number;
            change: number;
            changePercent: number;
        };
    };
}
//# sourceMappingURL=types.d.ts.map