const { pool } = require('../config/database');

async function createMessage(data) {
  const result = await pool.query(
    `INSERT INTO contact_messages
      (name, email, subject, message, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.name,
      data.email,
      data.subject || '',
      data.message,
      data.ip || '',
      data.userAgent || ''
    ]
  );

  return result.rows[0];
}

async function findAll() {
  const result = await pool.query(
    `SELECT * FROM contact_messages
     ORDER BY created_at DESC`
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    'SELECT * FROM contact_messages WHERE message_id = $1',
    [id]
  );

  return result.rows[0] || null;
}

async function markAsRead(id) {
  const result = await pool.query(
    `UPDATE contact_messages
     SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE message_id = $1
     RETURNING *`,
    [id]
  );

  return result.rows[0] || null;
}

async function markAsReplied(id) {
  const result = await pool.query(
    `UPDATE contact_messages
     SET replied = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE message_id = $1
     RETURNING *`,
    [id]
  );

  return result.rows[0] || null;
}

async function deleteById(id) {
  const result = await pool.query(
    'DELETE FROM contact_messages WHERE message_id = $1 RETURNING *',
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  createMessage,
  findAll,
  findById,
  markAsRead,
  markAsReplied,
  deleteById
};