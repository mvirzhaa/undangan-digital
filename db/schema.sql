-- Skema database Undangan Digital (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug        VARCHAR(80) NOT NULL UNIQUE,
  title       VARCHAR(200) NOT NULL,
  event_type  VARCHAR(30) NOT NULL DEFAULT 'wedding',
  status      VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  theme       VARCHAR(50) NOT NULL,
  colors      JSONB NOT NULL DEFAULT '{}'::jsonb,
  fonts       JSONB NOT NULL DEFAULT '{}'::jsonb,
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  views       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_user ON invitations(user_id);

CREATE TABLE IF NOT EXISTS guests (
  id             SERIAL PRIMARY KEY,
  invitation_id  INT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  name           VARCHAR(160) NOT NULL,
  code           VARCHAR(16) NOT NULL UNIQUE,
  group_name     VARCHAR(80) NOT NULL DEFAULT '',
  phone          VARCHAR(30) NOT NULL DEFAULT '',
  pax_limit      INT NOT NULL DEFAULT 1 CHECK (pax_limit BETWEEN 1 AND 50),
  kind           VARCHAR(12) NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual', 'group', 'private')),
  table_name     VARCHAR(60) NOT NULL DEFAULT '',
  opened_at      TIMESTAMPTZ,
  checked_in_at  TIMESTAMPTZ,
  checked_in_pax INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guests_invitation ON guests(invitation_id);

CREATE TABLE IF NOT EXISTS rsvps (
  id             SERIAL PRIMARY KEY,
  invitation_id  INT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  guest_id       INT REFERENCES guests(id) ON DELETE SET NULL,
  name           VARCHAR(160) NOT NULL,
  attendance     VARCHAR(10) NOT NULL CHECK (attendance IN ('hadir', 'tidak', 'ragu')),
  pax            INT NOT NULL DEFAULT 1 CHECK (pax BETWEEN 0 AND 50),
  menu           VARCHAR(120) NOT NULL DEFAULT '',
  note           VARCHAR(500) NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rsvps_invitation ON rsvps(invitation_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rsvps_guest ON rsvps(invitation_id, guest_id) WHERE guest_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wishes (
  id             SERIAL PRIMARY KEY,
  invitation_id  INT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  guest_id       INT REFERENCES guests(id) ON DELETE SET NULL,
  name           VARCHAR(160) NOT NULL,
  message        VARCHAR(1000) NOT NULL,
  approved       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wishes_invitation ON wishes(invitation_id);

-- ---- v2: versi undangan per tipe tamu (VIP / reguler, dst.) ----
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS versions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS version_id VARCHAR(30) NOT NULL DEFAULT '';

-- Nama template lama -> baru (aman dijalankan berulang)
UPDATE invitations SET theme = 'sage-garden' WHERE theme = 'sage-floral';
UPDATE invitations SET theme = 'royal-book' WHERE theme = 'midnight-royal';

-- ---- v3: presensi QR, photobooth, galeri kegiatan ----
-- Kunci akses petugas (pemindai tanpa login) & mesin photobooth; bisa diganti pemilik.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS staff_token VARCHAR(40) NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_staff_token ON invitations(staff_token);

-- Waktu hadir di photobooth (check-in buku tamu memakai guests.checked_in_at).
ALTER TABLE guests ADD COLUMN IF NOT EXISTS booth_at TIMESTAMPTZ;

-- Catatan setiap pemindaian (termasuk percobaan ulang yang ditolak).
CREATE TABLE IF NOT EXISTS scan_log (
  id             SERIAL PRIMARY KEY,
  invitation_id  INT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  guest_id       INT REFERENCES guests(id) ON DELETE CASCADE,
  station        VARCHAR(10) NOT NULL CHECK (station IN ('guestbook', 'booth')),
  result         VARCHAR(10) NOT NULL CHECK (result IN ('ok', 'duplicate')),
  source         VARCHAR(10) NOT NULL DEFAULT 'staff',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_log_invitation ON scan_log(invitation_id, created_at DESC);

-- Foto galeri: 'selfie' = swafoto tamu lewat QR acara, 'booth' = foto photobooth.
CREATE TABLE IF NOT EXISTS photos (
  id             SERIAL PRIMARY KEY,
  invitation_id  INT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  kind           VARCHAR(8) NOT NULL CHECK (kind IN ('selfie', 'booth')),
  guest_id       INT REFERENCES guests(id) ON DELETE SET NULL,
  uploader_name  VARCHAR(160) NOT NULL DEFAULT '',
  uploader_key   VARCHAR(40) NOT NULL DEFAULT '',
  file           VARCHAR(80) NOT NULL,
  mime           VARCHAR(20) NOT NULL,
  bytes          INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_invitation ON photos(invitation_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_guest ON photos(guest_id);
