/**
 * 郵件服務 - 透過 Resend API 處理所有郵件發送
 */
export declare class EmailService {
    private static resend;
    /**
     * 使用 API key 初始化 Resend 實例
     */
    private static initializeResend;
    /**
     * 發送管理操作通知郵件
     */
    static sendAdminOperationEmail(operationType: string, operationDetails: any): Promise<boolean>;
}
//# sourceMappingURL=emailService.d.ts.map