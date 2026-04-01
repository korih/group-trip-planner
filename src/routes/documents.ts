import { Hono } from 'hono';
import type { Env, ContextVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import { generateId } from '../lib/auth';

const documents = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file

// GET /trips/:tripId/documents
documents.get('/', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');
  const linkedToType = c.req.query('linkedToType');
  const linkedToId = c.req.query('linkedToId');

  const bindings: unknown[] = [tripId];
  let query = `
    SELECT d.*, u.name AS uploader_name
    FROM documents d
    JOIN users u ON d.uploader_id = u.id
    WHERE d.trip_id = ? AND d.confirmed = 1`;

  if (linkedToType) { query += ' AND d.linked_to_type = ?'; bindings.push(linkedToType); }
  if (linkedToId) { query += ' AND d.linked_to_id = ?'; bindings.push(linkedToId); }
  query += ' ORDER BY d.created_at DESC';

  const result = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ success: true, data: result.results });
});

// POST /trips/:tripId/documents/upload-url
// Returns a presigned R2 upload URL + document ID
documents.post('/upload-url', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');
  const body = await c.req.json<{
    filename: string;
    mimeType: string;
    sizeBytes: number;
    linkedToType?: 'reservation' | 'itinerary_item';
    linkedToId?: string;
  }>();

  if (body.sizeBytes > MAX_FILE_SIZE) {
    return c.json({ success: false, error: 'File too large (max 50MB)' }, 400);
  }

  const docId = generateId();
  const safeFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `trips/${tripId}/docs/${docId}/${safeFilename}`;

  // Insert pending document record
  await c.env.DB
    .prepare(
      `INSERT INTO documents (id, trip_id, uploader_id, filename, r2_key, mime_type, size_bytes, confirmed, linked_to_type, linked_to_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      docId,
      tripId,
      c.var.userId,
      body.filename,
      r2Key,
      body.mimeType,
      body.sizeBytes,
      body.linkedToType ?? null,
      body.linkedToId ?? null,
    )
    .run();

  // Generate presigned PUT URL (valid for 1 hour)
  // NOTE: Requires the R2 bucket to have a custom domain configured.
  // If no custom domain, clients should POST to /documents/:id/upload instead (Worker proxy).
  // TODO: const uploadUrl = await c.env.DOCUMENTS.createMultipartUpload(r2Key) or presigned URL
  // For now, return the Worker proxy upload endpoint
  const uploadUrl = `${new URL(c.req.url).origin}/trips/${tripId}/documents/${docId}/upload`;

  return c.json({ success: true, data: { documentId: docId, uploadUrl } });
});

// PUT /trips/:tripId/documents/:id/upload  — proxy upload to R2
// Client streams file body directly; Worker pipes to R2
documents.put('/:id/upload', requireAuth, async (c) => {
  const { tripId, id } = c.req.param();

  const doc = await c.env.DB
    .prepare('SELECT * FROM documents WHERE id = ? AND trip_id = ? AND confirmed = 0')
    .bind(id, tripId)
    .first<{ r2_key: string; mime_type: string; size_bytes: number }>();

  if (!doc) {
    return c.json({ success: false, error: 'Document not found' }, 404);
  }

  const body = c.req.raw.body;
  if (!body) {
    return c.json({ success: false, error: 'No file body' }, 400);
  }

  await c.env.DOCUMENTS.put(doc.r2_key, body, {
    httpMetadata: { contentType: doc.mime_type },
  });

  // Mark as confirmed
  await c.env.DB
    .prepare('UPDATE documents SET confirmed = 1 WHERE id = ?')
    .bind(id)
    .run();

  return c.json({ success: true, data: { id } });
});

// POST /trips/:tripId/documents/:id/confirm  — confirm after direct R2 upload
documents.post('/:id/confirm', requireAuth, async (c) => {
  const { id, tripId } = c.req.param();

  // Verify the object actually exists in R2 before confirming
  const doc = await c.env.DB
    .prepare('SELECT r2_key FROM documents WHERE id = ? AND trip_id = ?')
    .bind(id, tripId)
    .first<{ r2_key: string }>();

  if (!doc) return c.json({ success: false, error: 'Document not found' }, 404);

  const obj = await c.env.DOCUMENTS.head(doc.r2_key);
  if (!obj) return c.json({ success: false, error: 'File not found in storage' }, 404);

  await c.env.DB.prepare('UPDATE documents SET confirmed = 1 WHERE id = ?').bind(id).run();

  return c.json({ success: true, data: { id } });
});

// GET /trips/:tripId/documents/:id/download  — proxy download from R2
documents.get('/:id/download', requireAuth, async (c) => {
  const { id, tripId } = c.req.param();

  const doc = await c.env.DB
    .prepare('SELECT * FROM documents WHERE id = ? AND trip_id = ? AND confirmed = 1')
    .bind(id, tripId)
    .first<{ r2_key: string; filename: string; mime_type: string }>();

  if (!doc) return c.json({ success: false, error: 'Document not found' }, 404);

  const obj = await c.env.DOCUMENTS.get(doc.r2_key);
  if (!obj) return c.json({ success: false, error: 'File not found in storage' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': doc.mime_type,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.filename)}"`,
    },
  });
});

// DELETE /trips/:tripId/documents/:id
documents.delete('/:id', requireAuth, async (c) => {
  const { id, tripId } = c.req.param();

  const doc = await c.env.DB
    .prepare('SELECT r2_key FROM documents WHERE id = ? AND trip_id = ?')
    .bind(id, tripId)
    .first<{ r2_key: string }>();

  if (!doc) return c.json({ success: false, error: 'Document not found' }, 404);

  await Promise.all([
    c.env.DOCUMENTS.delete(doc.r2_key),
    c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run(),
  ]);

  return c.json({ success: true, data: null });
});

export default documents;
