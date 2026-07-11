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
     * 發送郵箱驗證碼給使用者
     */
    static sendVerificationEmail(email: string, verificationCode: string, userName?: string): Promise<boolean>;
    /**
     * 發送含驗證碼的密碼重設郵件
     */
    static sendPasswordResetEmail(email: string, resetCode: string, userName?: string): Promise<boolean>;
    /**
     * 發送管理操作通知郵件
     */
    static sendAdminOperationEmail(operationType: string, operationDetails: any): Promise<boolean>;
}
//# sourceMappingURL=emailService.d.ts.map