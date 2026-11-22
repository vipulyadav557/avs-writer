const AdminNotification = require('../models/AdminNotification');
const {
    sendAdminNotificationEmail
} = require('./emailService');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

async function notifyAdmin({
    eventType,
    title,
    message,
    targetUrl = '/admin',
    metadata = {}
}) {
    try {
        const notification = await AdminNotification.create({
            eventType,
            title,
            message,
            targetUrl,
            metadata
        });

        const safeTitle = escapeHtml(title);
        const safeMessage = escapeHtml(message);

        const emailResult = await sendAdminNotificationEmail({
            subject: `[AVS Writer] ${title}`,
            text: `${message}\n\nOpen Admin Dashboard: ${targetUrl}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#222">
                    <h2 style="color:#9b7845">AVS Writer</h2>
                    <h3>${safeTitle}</h3>
                    <p>${safeMessage}</p>
                    <p>
                        <a href="${escapeHtml(
                            process.env.APP_URL || 'http://localhost:3000'
                        )}${escapeHtml(targetUrl)}"
                           style="display:inline-block;padding:12px 20px;background:#9b7845;color:white;text-decoration:none;border-radius:6px">
                            Open Admin Dashboard
                        </a>
                    </p>
                </div>
            `
        });

        if (!emailResult.success) {
            console.warn(
                'Notification saved, but admin email was not sent:',
                emailResult.reason
            );
        }

        return notification;

    } catch (error) {
        console.error('ADMIN NOTIFICATION ERROR:', error.message);
        return null;
    }
}

module.exports = {
    notifyAdmin
};
