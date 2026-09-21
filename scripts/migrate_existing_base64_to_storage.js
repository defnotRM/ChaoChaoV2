const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(url, key);

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function uploadBase64(bucket, folder, base64Str, prefix) {
  const match = base64Str.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  const ext = MIME_TO_EXT[mimeType] || 'png';
  const filePath = `${folder}/${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    console.error(`Upload error for ${bucket}/${filePath}:`, error.message);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrl;
}

async function migratePayments() {
  console.log("Checking payments for base64 slips...");
  const { data: payments, error } = await supabase
    .from('payment')
    .select('payment_id, order_id, slip_image_url');

  if (error) {
    console.error("Error fetching payments:", error);
    return;
  }

  let count = 0;
  for (const p of (payments || [])) {
    if (p.slip_image_url && p.slip_image_url.startsWith('data:image/')) {
      const publicUrl = await uploadBase64('slips', p.order_id || 'misc', p.slip_image_url, 'migrated_slip');
      if (publicUrl) {
        await supabase
          .from('payment')
          .update({ slip_image_url: publicUrl })
          .eq('payment_id', p.payment_id);
        count++;
        console.log(`Migrated payment slip ${p.payment_id} -> ${publicUrl}`);
      }
    }
  }
  console.log(`Finished migrating ${count} payment slips.`);
}

async function migrateEvidence() {
  console.log("Checking rental evidence images for base64...");
  const { data: evidences, error } = await supabase
    .from('rentalevidenceimage')
    .select('evidence_id, order_id, evidence_type, image_url');

  if (error) {
    console.error("Error fetching evidence:", error);
    return;
  }

  let count = 0;
  for (const e of (evidences || [])) {
    if (e.image_url && e.image_url.startsWith('data:image/')) {
      const publicUrl = await uploadBase64(
        'rental-evidence',
        e.order_id || 'misc',
        e.image_url,
        `migrated_${e.evidence_type || 'evidence'}`
      );
      if (publicUrl) {
        await supabase
          .from('rentalevidenceimage')
          .update({ image_url: publicUrl })
          .eq('evidence_id', e.evidence_id);
        count++;
        console.log(`Migrated evidence image ${e.evidence_id} -> ${publicUrl}`);
      }
    }
  }
  console.log(`Finished migrating ${count} evidence images.`);
}

async function main() {
  await migratePayments();
  await migrateEvidence();
  console.log("Migration complete!");
}

main();
