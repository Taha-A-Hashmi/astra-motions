/* ═══════════════════════════════════════════════════════════════════════
   server/content.js — where the dashboard's edits live.

   On Vercel the filesystem is ephemeral, so content and uploaded images
   go to Vercel Blob (BLOB_READ_WRITE_TOKEN is injected by the linked
   store). Locally, without that token, everything lands in DATA_DIR/cms
   and uploads are served from /uploads.
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const BLOB_KEY = 'cms/content.json';
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

let blob; // lazy import so local dev never needs the package to resolve first
async function blobApi() {
  blob ??= await import('@vercel/blob');
  return blob;
}

const localDir = () => path.join(config.dataDir, 'cms');
const localFile = () => path.join(localDir(), 'content.json');
export const uploadsDir = () => path.join(localDir(), 'uploads');

// One process-wide cache, so a burst of page views costs one read
let cache = { at: 0, values: null };
const TTL = 20_000;

export function storageInfo() {
  return useBlob() ? 'vercel blob' : localFile();
}

/** The saved values (an object keyed by field key), or {} when nothing has been saved. */
export async function loadContent({ fresh = false } = {}) {
  if (!fresh && cache.values && Date.now() - cache.at < TTL) return cache.values;
  let values = {};
  try {
    if (useBlob()) {
      const { list } = await blobApi();
      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
      if (blobs.length) {
        // cache-buster: the Blob CDN may hold an older copy for up to a minute
        const res = await fetch(`${blobs[0].url}?v=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) values = await res.json();
      }
    } else if (fs.existsSync(localFile())) {
      values = JSON.parse(fs.readFileSync(localFile(), 'utf8'));
    }
  } catch (err) {
    console.error('[cms] load failed:', err.message);
    if (cache.values) return cache.values;
  }
  if (!values || typeof values !== 'object' || Array.isArray(values)) values = {};
  cache = { at: Date.now(), values };
  return values;
}

export async function saveContent(values) {
  const body = JSON.stringify(values, null, 2);
  if (useBlob()) {
    const { put } = await blobApi();
    await put(BLOB_KEY, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  } else {
    fs.mkdirSync(localDir(), { recursive: true });
    fs.writeFileSync(localFile(), body);
  }
  cache = { at: Date.now(), values };
  return values;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

/** Store an uploaded image, return its public URL. */
export async function saveImage({ name, type, buffer }) {
  const ext = EXT[type];
  if (!ext) throw Object.assign(new Error('Only JPG, PNG, WebP, GIF or SVG images'), { status: 422 });
  const base = String(name || 'image')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
  const file = `${base}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  if (useBlob()) {
    const { put } = await blobApi();
    const res = await put(`cms/uploads/${file}`, buffer, { access: 'public', addRandomSuffix: false, contentType: type });
    return res.url;
  }
  fs.mkdirSync(uploadsDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadsDir(), file), buffer);
  return `/uploads/${file}`;
}
