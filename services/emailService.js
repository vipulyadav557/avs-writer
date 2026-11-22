const nodemailer = require('nodemailer');

async function sendAdminNotificationEmail({
    subject,
    text,
    html
}) {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';

    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASS;
    const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || user;

    if (!user || !password || !recipient) {
        console.warn(
            'ADMIN EMAIL SKIPPED: SMTP configuration is incomplete.'
        );

        return {
            success: false,
            reason: 'SMTP configuration is incomplete.'
        };
    }

    try {
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: {
                user,
                pass: password
            }
        });

        const info = await transporter.sendMail({
            from: `"AVS Writer Notifications" <${user}>`,
            to: recipient,
            subject,
            text,
            html
        });

        console.log('ADMIN EMAIL SENT:', info.messageId);

        return {
            success: true,
            messageId: info.messageId
        };

    } catch (error) {
        console.error('ADMIN EMAIL ERROR:', error.message);

        return {
            success: false,
            reason: error.message
        };
    }
}

module.exports = {
    sendAdminNotificationEmail
};
