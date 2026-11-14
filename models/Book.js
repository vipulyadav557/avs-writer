
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

// Common fields with PostgreSQL to EJS aliases
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

async function incrementViews(id) {
  await pool.query(
    'UPDATE books SET views = views + 1 WHERE book_id = $1',
    [id]
  );
}

module.exports = {
  findPublished,
  findOnePublished,
  incrementViews,
  languages,
  categories,
  slugify
};
