/**
 * Exchange Constants and Types
 */
export interface SupportedExchange {
    id: string;
    displayName: string;
    requiresPassphrase: boolean;
    icon: string;
    website?: string;
}
export declare const KURA_SUPPORTED_EXCHANGES: SupportedExchange[];
export declare const EXCHANGE_DISPLAY_MAP: {
    [key: string]: string;
};
export declare const EXCHANGES_REQUIRING_PASSPHRASE: string[];
//# sourceMappingURL=constants.d.ts.map