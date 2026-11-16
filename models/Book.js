
const { pool } = require('../config/database');
const slugify = require('slugify');

const languages = ['Hindi', 'Urdu', 'English', 'Bhojpuri'];

const categories = [
  'Life Experiences',
  'Self Improvement',
  'Relationships',
  'Life Lessons',
  'Personal Experiences',
  'Poetry',
  'Shayari',
  'Ghazal',
  'Nazm',
  'Kahani',
  'Bhojpuri Songs',
  'Fiction',
  'Non-Fiction',
  'Memoir'
];

const bookFields = `
  book_id AS "_id",
  title,
  slug,
  subtitle,
  author,
  description,
  language,
  categories,
  cover_url AS "coverUrl",
  pdf_url AS "pdfUrl",
  pdf_path AS "pdfPath",
  isbn,
  publisher,
  published_date AS "publishedDate",
  pages,
  price,
  is_published AS "isPublished",
  table_of_contents AS "tableOfContents",
  what_readers_learn AS "whatReadersLearn",
  author_intro AS "authorIntro",
  status,
  featured,
  views,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (!value) return [];

  return String(value)
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validStatus(status) {
  return status === 'published' ? 'published' : 'draft';
}

async function makeUniqueSlug(title, excludeId = null) {
  const baseSlug = slugify(title || 'book', {
    lower: true,
    strict: true,
    trim: true
  }) || 'book';

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const values = [slug];
    let query = 'SELECT book_id FROM books WHERE slug = $1';

    if (excludeId) {
      values.push(excludeId);
      query += ' AND book_id <> $2';
    }

    const result = await pool.query(query, values);

    if (!result.rows.length) {
      return slug;
    }

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

// PUBLIC: Published books listing
async function findPublished(filters = {}) {
  const conditions = ["status = 'published'"];
  const values = [];

  if (filters.category) {
    values.push(filters.category);
    conditions.push(`$${values.length} = ANY(categories)`);
  }

  if (filters.language) {
    values.push(filters.language);
    conditions.push(`language = $${values.length}`);
  }

  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(
      `(title ILIKE $${values.length} OR description ILIKE $${values.length})`
    );
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = 12;
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `SELECT ${bookFields}
     FROM books
     WHERE ${conditions.join(' AND ')}
     ORDER BY featured DESC, created_at DESC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  const count = await pool.query(
    `SELECT COUNT(*) FROM books
     WHERE ${conditions.join(' AND ')}`,
    values
  );

  return {
    books: result.rows,
    total: Number(count.rows[0].count),
    page,
    limit
  };
}

// PUBLIC: Single published book
async function findOnePublished(slug) {
  const result = await pool.query(
    `SELECT ${bookFields}
     FROM books
     WHERE slug = $1 AND status = 'published'
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

// ADMIN: All books, including drafts
// ADMIN: All books with pagination, including drafts
async function findAllAdmin(page = 1) {
  const limit = 50;
  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (currentPage - 1) * limit;

  const [result, countResult] = await Promise.all([
    pool.query(
      `SELECT ${bookFields}
       FROM books
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query('SELECT COUNT(*) FROM books')
  ]);

  const total = Number(countResult.rows[0].count);

  return {
    books: result.rows,
    total,
    page: currentPage,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

// ADMIN: Find book by ID
async function findById(id) {
  const result = await pool.query(
    `SELECT ${bookFields}
     FROM books
     WHERE book_id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

// ADMIN: Create book
async function createBook(data) {
  const title = String(data.title || '').trim();

  if (!title) {
    throw new Error('Book title is required.');
  }

  const slug = await makeUniqueSlug(title);
  const status = validStatus(data.status);

  const result = await pool.query(
    `INSERT INTO books (
      title,
      slug,
      subtitle,
      author,
      description,
      language,
      categories,
      cover_url,
      pdf_url,
      pdf_path,
      isbn,
      publisher,
      published_date,
      pages,
      price,
      is_published,
      table_of_contents,
      what_readers_learn,
      author_intro,
      status
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20
    )
    RETURNING ${bookFields}`,
    [
      title,
      slug,
      data.subtitle || '',
      data.author || 'Vipul Kumar Yadav',
      data.description || '',
      data.language || 'Hindi',
      toArray(data.categories),
      data.coverUrl || '',
      data.pdfUrl || '',
      data.pdfPath || '',
      data.isbn || '',
      data.publisher || '',
      data.publishedDate || null,
      toNumber(data.pages),
      toNumber(data.price),
      status === 'published',
      toArray(data.tableOfContents),
      toArray(data.whatReadersLearn),
      data.authorIntro || '',
      status
    ]
  );

  return result.rows[0];
}

// ADMIN: Update existing book
async function updateBook(id, data) {
  const existing = await findById(id);

  if (!existing) {
    return null;
  }

  const title = String(data.title || existing.title).trim();

  if (!title) {
    throw new Error('Book title is required.');
  }

  const slug = title !== existing.title
    ? await makeUniqueSlug(title, id)
    : existing.slug;

  const status = data.status
    ? validStatus(data.status)
    : existing.status;

  const result = await pool.query(
    `UPDATE books SET
      title = $1,
      slug = $2,
      subtitle = $3,
      author = $4,
      description = $5,
      language = $6,
      categories = $7,
      cover_url = $8,
      pdf_url = $9,
      pdf_path = $10,
      isbn = $11,
      publisher = $12,
      published_date = $13,
      pages = $14,
      price = $15,
      is_published = $16,
      table_of_contents = $17,
      what_readers_learn = $18,
      author_intro = $19,
      status = $20,
      updated_at = CURRENT_TIMESTAMP
     WHERE book_id = $21
     RETURNING ${bookFields}`,
    [
      title,
      slug,
      data.subtitle ?? existing.subtitle,
      data.author ?? existing.author,
      data.description ?? existing.description,
      data.language ?? existing.language,
      data.categories !== undefined
        ? toArray(data.categories)
        : existing.categories,
      data.coverUrl ?? existing.coverUrl,
      data.pdfUrl ?? existing.pdfUrl,
      data.pdfPath ?? existing.pdfPath,
      data.isbn ?? existing.isbn,
      data.publisher ?? existing.publisher,
      data.publishedDate !== undefined
        ? (data.publishedDate || null)
        : existing.publishedDate,
      data.pages !== undefined
        ? toNumber(data.pages)
        : existing.pages,
      data.price !== undefined
        ? toNumber(data.price)
        : existing.price,
      status === 'published',
      data.tableOfContents !== undefined
        ? toArray(data.tableOfContents)
        : existing.tableOfContents,
      data.whatReadersLearn !== undefined
        ? toArray(data.whatReadersLearn)
        : existing.whatReadersLearn,
      data.authorIntro ?? existing.authorIntro,
      status,
      id
    ]
  );

  return result.rows[0] || null;
}

// ADMIN: Publish or unpublish
async function updateStatus(id, status) {
  const safeStatus = validStatus(status);

  const result = await pool.query(
    `UPDATE books
     SET status = $1,
         is_published = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE book_id = $3
     RETURNING ${bookFields}`,
    [safeStatus, safeStatus === 'published', id]
  );

  return result.rows[0] || null;
}

// ADMIN: Delete book record
async function deleteBook(id) {
  const result = await pool.query(
    `DELETE FROM books
     WHERE book_id = $1
     RETURNING ${bookFields}`,
    [id]
  );

  return result.rows[0] || null;
}

// PUBLIC: Increment book views
async function incrementViews(id) {
  await pool.query(
    'UPDATE books SET views = views + 1 WHERE book_id = $1',
    [id]
  );
}

module.exports = {
  findPublished,
  findOnePublished,
  findAllAdmin,
  findById,
  createBook,
  updateBook,
  updateStatus,
  deleteBook,
  incrementViews,
  languages,
  categories,
  slugify
};
