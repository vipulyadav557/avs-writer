const express = require('express');

const { requireAuth, requireAdmin } = require('../middleware/auth');
const AdminNotification = require('../models/AdminNotification');

const router = express.Router();

// Admin-only access for all notification routes.
router.use(requireAuth);
router.use(requireAdmin);

// Dedicated notifications page.
router.get('/notifications', async (req, res) => {
    try {
        const [notifications, unreadCount] = await Promise.all([
            AdminNotification.getRecent(100),
            AdminNotification.getUnreadCount()
        ]);

        return res.render('pages/admin-notifications', {
            title: 'Notifications',
            notifications,
            unreadCount
        });
    } catch (error) {
        console.error('ADMIN NOTIFICATIONS PAGE ERROR:', error);
        return res.status(500).send('Unable to load notifications.');
    }
});

// Mark all notifications as read.
router.post('/notifications/read-all', async (req, res) => {
    try {
        await AdminNotification.markAllAsRead();
        return res.redirect('/admin/notifications');
    } catch (error) {
        console.error('MARK ALL NOTIFICATIONS READ ERROR:', error);
        return res.status(500).send('Unable to update notifications.');
    }
});

// Delete all notifications.
router.post('/notifications/delete-all', async (req, res) => {
    try {
        await AdminNotification.deleteAll();
        return res.redirect('/admin/notifications');
    } catch (error) {
        console.error('DELETE ALL NOTIFICATIONS ERROR:', error);
        return res.status(500).send('Unable to delete notifications.');
    }
});

// Mark one notification as read.
router.post('/notifications/:id/read', async (req, res) => {
    try {
        const notificationId = Number(req.params.id);

        if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
            return res.status(400).send('Invalid notification ID.');
        }

        await AdminNotification.markAsRead(notificationId);

        return res.redirect('/admin/notifications');
    } catch (error) {
        console.error('MARK NOTIFICATION READ ERROR:', error);
        return res.status(500).send('Unable to update notification.');
    }
});

// Delete one notification.
router.post('/notifications/:id/delete', async (req, res) => {
    try {
        const notificationId = Number(req.params.id);

        if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
            return res.status(400).send('Invalid notification ID.');
        }

        await AdminNotification.deleteById(notificationId);

        return res.redirect('/admin/notifications');
    } catch (error) {
        console.error('DELETE NOTIFICATION ERROR:', error);
        return res.status(500).send('Unable to delete notification.');
    }
});

// Preserve notification data for the existing Admin Dashboard.
router.get('/', async (req, res, next) => {
    try {
        const [notifications, unreadCount] = await Promise.all([
            AdminNotification.getRecent(20),
            AdminNotification.getUnreadCount()
        ]);

        res.locals.adminNotifications = notifications;
        res.locals.adminUnreadCount = unreadCount;
    } catch (error) {
        console.error('ADMIN NOTIFICATIONS LOAD ERROR:', error);

        res.locals.adminNotifications = [];
        res.locals.adminUnreadCount = 0;
    }

    next();
});

module.exports = router;