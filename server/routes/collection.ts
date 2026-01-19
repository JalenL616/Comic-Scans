import { Router, Response } from 'express';
import * as db from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/collection - Get user's comics
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT upc, name, issue_number as "issueNumber", series_name as "seriesName",
              series_volume as "seriesVolume", series_year as "seriesYear",
              cover_image as "coverImage", printing, variant_number as "variantNumber",
              COALESCE(starred, false) as "starred", COALESCE(sort_order, 0) as "sortOrder"
       FROM user_comics WHERE user_id = $1
       ORDER BY COALESCE(starred, false) DESC, COALESCE(sort_order, 0) ASC, added_at DESC`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get collection' });
  }
});

// POST /api/collection - Add comic to collection
router.post('/', async (req: AuthRequest, res: Response) => {
  const comic = req.body;

  if (!comic.upc) {
    res.status(400).json({ error: 'UPC required' });
    return;
  }

  try {
    // Get max sort_order to add new comic at the end
    const maxResult = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM user_comics WHERE user_id = $1',
      [req.user!.id]
    );
    const nextOrder = maxResult.rows[0].next_order;

    await db.query(
      `INSERT INTO user_comics (user_id, upc, name, issue_number, series_name, series_volume, series_year, cover_image, printing, variant_number, starred, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id, upc) DO NOTHING`,
      [req.user!.id, comic.upc, comic.name, comic.issueNumber, comic.seriesName,
       comic.seriesVolume, comic.seriesYear, comic.coverImage, comic.printing, comic.variantNumber,
       comic.starred || false, nextOrder]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comic' });
  }
});

// PATCH /api/collection/:upc/star - Toggle starred status
router.patch('/:upc/star', async (req: AuthRequest, res: Response) => {
  const { starred } = req.body;

  try {
    await db.query(
      'UPDATE user_comics SET starred = $1 WHERE user_id = $2 AND upc = $3',
      [starred, req.user!.id, req.params.upc]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update starred status' });
  }
});

// PUT /api/collection/reorder - Update sort order for multiple comics
router.put('/reorder', async (req: AuthRequest, res: Response) => {
  const { comics } = req.body; // Array of { upc, sortOrder }

  if (!Array.isArray(comics)) {
    res.status(400).json({ error: 'Comics array required' });
    return;
  }

  try {
    // Update each comic's sort order in a transaction
    await db.query('BEGIN');

    for (const comic of comics) {
      await db.query(
        'UPDATE user_comics SET sort_order = $1 WHERE user_id = $2 AND upc = $3',
        [comic.sortOrder, req.user!.id, comic.upc]
      );
    }

    await db.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to reorder comics' });
  }
});

// DELETE /api/collection/:upc - Remove comic from collection
router.delete('/:upc', async (req: AuthRequest, res: Response) => {
  try {
    await db.query(
      'DELETE FROM user_comics WHERE user_id = $1 AND upc = $2',
      [req.user!.id, req.params.upc]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove comic' });
  }
});

export default router;
