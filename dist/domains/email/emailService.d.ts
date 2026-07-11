/**
 * Email Service - Handles all email sending via Resend API
 */
export declare class EmailService {
    private static resend;
    /**
     * Initialize Resend instance with API key
     */
    private static initializeResend;
    /**
     * Send email verification code to user
     */
    static sendVerificationEmail(email: string, verificationCode: string, userName?: string): Promise<boolean>;
    /**
     * Send password reset email with verification code
     */
    static sendPasswordResetEmail(email: string, resetCode: string, userName?: string): Promise<boolean>;
}
//# sourceMappingURL=emailService.d.ts.map