
const { pool } = require('../config/database');
const slugify = require('slugify');
const crypto = require('crypto');

const categories = [
  'Shayari',
  'Ghazal',
  'Nazm',
  'Kavita',
  'Bhojpuri Song',
  'Kahani'
];

const languages = ['Hindi', 'Urdu', 'English', 'Bhojpuri'];

const statuses = ['draft', 'pending', 'published', 'rejected'];

const poemFields = `
  poem_id AS "_id",
  user_id AS "userId",
  title,
  slug,
  body,
  category,
  language,
  mood,
  tags,
  author,
  image_url AS "imageUrl",
  image_original_name AS "imageOriginalName",
  image_mime_type AS "imageMimeType",
  image_size AS "imageSize",
  document_url AS "documentUrl",
  document_original_name AS "documentOriginalName",
  document_mime_type AS "documentMimeType",
  document_size AS "documentSize",
  is_featured AS "isFeatured",
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function createBaseSlug(title) {
  return slugify(title || '', {
    lower: true,
    strict: true,
    trim: true
  }) || `poem-${crypto.randomUUID()}`;
}

async function makeUniqueSlug(title, excludeId = null) {
  const baseSlug = createBaseSlug(title);
  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const values = [candidate];
    let sql = 'SELECT 1 FROM poems WHERE slug = $1';

    if (excludeId !== null) {
      values.push(excludeId);
      sql += ' AND poem_id <> $2';
    }

    sql += ' LIMIT 1';

    const result = await pool.query(sql, values);

    if (result.rowCount === 0) {
      return candidate;
    }

    candidate = `${baseSlug}-${counter++}`;
  }
}

// Find published poems with filters and pagination
async function findPublished(filters = {}) {
  const conditions = ["status = 'published'"];
  const values = [];

  if (filters.category && categories.includes(filters.category)) {
    values.push(filters.category);
    conditions.push(`category = $${values.length}`);
  }

  if (filters.language && languages.includes(filters.language)) {
    values.push(filters.language);
    conditions.push(`language = $${values.length}`);
  }

  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(
      `(title ILIKE $${values.length} OR body ILIKE $${values.length})`
    );
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = 12;
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `SELECT ${poemFields}
     FROM poems
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  const count = await pool.query(
    `SELECT COUNT(*) FROM poems
     WHERE ${conditions.join(' AND ')}`,
    values
  );

  return {
    poems: result.rows,
    total: Number(count.rows[0].count),
    page,
    limit
  };
}

// Find one publicly published poem by slug
async function findOnePublished(slug) {
  const result = await pool.query(
    `SELECT ${poemFields}
     FROM poems
     WHERE slug = $1 AND status = 'published'
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

// Find all poems
async function findAll() {
  const result = await pool.query(
    `SELECT ${poemFields}
     FROM poems
     ORDER BY created_at DESC`
  );

  return result.rows;
}

// Find poem by ID
async function findById(id) {
  const result = await pool.query(
    `SELECT ${poemFields}
     FROM poems
     WHERE poem_id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

// Find poems belonging to one writer
async function findByUserId(userId) {
  const result = await pool.query(
    `SELECT ${poemFields}
     FROM poems
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

// Create a new poem
async function create(data) {
  const slug = await makeUniqueSlug(data.title);

  const status = statuses.includes(data.status)
    ? data.status
    : 'draft';

  const result = await pool.query(
    `INSERT INTO poems (
       user_id,
       title,
       slug,
       body,
       category,
       language,
       mood,
       tags,
       author,
       image_url,
       image_original_name,
       image_mime_type,
       image_size,
       document_url,
       document_original_name,
       document_mime_type,
       document_size,
       status
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16, $17, $18
     )
     RETURNING ${poemFields}`,
    [
      data.userId || null,
      data.title.trim(),
      slug,
      data.body,
      data.category,
      data.language,
      data.mood || '',
      Array.isArray(data.tags) ? data.tags : [],
      data.author || 'Anonymous',
      data.imageUrl || '',
      data.imageOriginalName || null,
      data.imageMimeType || null,
      data.imageSize || null,
      data.documentUrl || null,
      data.documentOriginalName || null,
      data.documentMimeType || null,
      data.documentSize || null,
      status
    ]
  );

  return result.rows[0];
}

// Update poem without accidentally removing existing attachments
async function update(id, data) {
  const slug = await makeUniqueSlug(data.title, id);

  const imageProvided = data.imageUrl !== undefined;
  const imageMetadataProvided =
    data.imageOriginalName !== undefined ||
    data.imageMimeType !== undefined ||
    data.imageSize !== undefined;

  const documentProvided =
    data.documentUrl !== undefined ||
    data.documentOriginalName !== undefined ||
    data.documentMimeType !== undefined ||
    data.documentSize !== undefined;

  const result = await pool.query(
    `UPDATE poems
     SET title = $1,
         slug = $2,
         body = $3,
         category = $4,
         language = $5,
         mood = $6,
         tags = $7,
         author = $8,

         image_url = CASE
           WHEN $10 THEN $11
           ELSE image_url
         END,

         image_original_name = CASE
           WHEN $12 THEN $13
           ELSE image_original_name
         END,

         image_mime_type = CASE
           WHEN $12 THEN $14
           ELSE image_mime_type
         END,

         image_size = CASE
           WHEN $12 THEN $15
           ELSE image_size
         END,

         document_url = CASE
           WHEN $16 THEN $17
           ELSE document_url
         END,

         document_original_name = CASE
           WHEN $16 THEN $18
           ELSE document_original_name
         END,

         document_mime_type = CASE
           WHEN $16 THEN $19
           ELSE document_mime_type
         END,

                  document_size = CASE
           WHEN $16 THEN $20
           ELSE document_size
         END,

         status = COALESCE($21, status),

         updated_at = CURRENT_TIMESTAMP

     WHERE poem_id = $9
     RETURNING ${poemFields}`,
    [
      data.title.trim(),
      slug,
      data.body,
      data.category,
      data.language,
      data.mood || '',
      Array.isArray(data.tags) ? data.tags : [],
      data.author || 'Anonymous',
      id,

      imageProvided,
      imageProvided ? (data.imageUrl || '') : null,

      imageMetadataProvided,
      data.imageOriginalName || null,
      data.imageMimeType || null,
      data.imageSize || null,

           documentProvided,
      data.documentUrl || null,
      data.documentOriginalName || null,
      data.documentMimeType || null,
      data.documentSize || null,
      data.status || null
    ]
  );

  return result.rows[0] || null;
}

// Update poem status
async function updateStatus(id, status) {
  if (!statuses.includes(status)) {
    throw new Error('Invalid poem status.');
  }

  const result = await pool.query(
    `UPDATE poems
     SET status = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE poem_id = $2
     RETURNING ${poemFields}`,
    [status, id]
  );

  return result.rows[0] || null;
}

// Delete poem
async function deleteById(id) {
  const result = await pool.query(
    `DELETE FROM poems
     WHERE poem_id = $1
     RETURNING ${poemFields}`,
    [id]
  );

  return result.rows[0] || null;
}
// Get featured and latest published poems for homepage
async function findHomepage() {
  const featuredResult = await pool.query(
    `SELECT ${poemFields}
     FROM poems
     WHERE status = 'published'
       AND is_featured = TRUE
     ORDER BY updated_at DESC
     LIMIT 3`
  );

  const latestResult = await pool.query(
    `SELECT ${poemFields}
     FROM poems
     WHERE status = 'published'
       AND is_featured = FALSE
     ORDER BY created_at DESC
     LIMIT 3`
  );

  return {
    featured: featuredResult.rows,
    latest: latestResult.rows
  };
}

// Mark or unmark a published poem as featured
async function setFeatured(id, featured) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Serialize all featured-poem changes.
    await client.query(
      'SELECT pg_advisory_xact_lock($1, $2)',
      [20261116, 13]
    );

    // Confirm the poem exists and is published.
    const poemResult = await client.query(
      `SELECT poem_id
       FROM poems
       WHERE poem_id = $1
         AND status = 'published'
       FOR UPDATE`,
      [id]
    );

    if (poemResult.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }

    if (featured) {
      const countResult = await client.query(
        `SELECT COUNT(*)
         FROM poems
         WHERE status = 'published'
           AND is_featured = TRUE
           AND poem_id <> $1`,
        [id]
      );

      if (Number(countResult.rows[0].count) >= 3) {
        throw new Error('Maximum 3 featured poems are allowed.');
      }
    }

    const result = await client.query(
      `UPDATE poems
       SET is_featured = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE poem_id = $2
         AND status = 'published'
       RETURNING ${poemFields}`,
      [featured, id]
    );

    await client.query('COMMIT');

    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
module.exports = {
  findPublished,
  findHomepage,
  setFeatured,
  findOnePublished,
  findAll,
  findById,
  findByUserId,
  create,
  update,
  updateStatus,
  deleteById,
  categories,
  languages,
  statuses,
  slugify
};
