-- ============================================================
--  LocalMart Hub  –  PostgreSQL Schema
--  Converted from SQLite
--  Run: psql -U <user> -d localmart -f schema_postgres.sql
-- ============================================================

-- ─────────────────────────────────────────────
--  PARTNERS  (main user table)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partners (
    id                  TEXT PRIMARY KEY,          -- e.g. LMH-001
    name                TEXT NOT NULL,
    phone               TEXT NOT NULL UNIQUE,
    email               TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    dob                 TEXT,
    gender              TEXT,
    zone                TEXT,
    address             TEXT,
    vehicle_type        TEXT,                       -- Motorcycle | Scooter | Bicycle | Car
    joined_date         DATE DEFAULT CURRENT_DATE,
    rating              NUMERIC(3,1) DEFAULT 5.0,
    rating_count        INTEGER DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    is_verified         BOOLEAN DEFAULT FALSE,
    referral_code       TEXT UNIQUE,               -- e.g. LMH-ARJUN
    referred_by         TEXT REFERENCES partners(id),
    profile_photo_url   TEXT,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  DOCUMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    aadhaar             TEXT,
    pan                 TEXT,
    driving_licence     TEXT,
    rc_number           TEXT,
    insurance_policy    TEXT,
    puc_number          TEXT,
    bgv_reference       TEXT,
    aadhaar_status      TEXT DEFAULT 'Pending',    -- Verified | Pending | Missing
    pan_status          TEXT DEFAULT 'Pending',
    licence_status      TEXT DEFAULT 'Pending',
    rc_status           TEXT DEFAULT 'Pending',
    insurance_status    TEXT DEFAULT 'Pending',
    puc_status          TEXT DEFAULT 'Pending',
    photo_status        TEXT DEFAULT 'Pending',
    bgv_status          TEXT DEFAULT 'Pending',
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  VEHICLE DETAILS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
    vehicle_type        TEXT,
    reg_number          TEXT UNIQUE,
    colour              TEXT,
    make                TEXT,
    model               TEXT,
    year                TEXT,
    fuel_type           TEXT,
    engine_cc           TEXT,
    chassis_number      TEXT,
    engine_number       TEXT,
    rc_expiry           TEXT,
    insurance_expiry    TEXT,
    puc_expiry          TEXT,
    insurance_valid     BOOLEAN DEFAULT FALSE,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  BANK DETAILS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_details (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
    bank_name           TEXT,
    account_holder      TEXT,
    account_number      TEXT,                       -- store encrypted in production
    ifsc                TEXT,
    branch              TEXT,
    account_type        TEXT DEFAULT 'Savings',
    is_verified         BOOLEAN DEFAULT FALSE,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upi_ids (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    upi_id              TEXT NOT NULL,
    is_primary          BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  WALLET
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
    balance             NUMERIC(12,2) DEFAULT 0.00,
    locked_amount       NUMERIC(12,2) DEFAULT 0.00,
    total_earned        NUMERIC(12,2) DEFAULT 0.00,
    total_withdrawn     NUMERIC(12,2) DEFAULT 0.00,
    pending_settlement  NUMERIC(12,2) DEFAULT 0.00,
    next_payout_date    TEXT,
    min_withdraw        NUMERIC(12,2) DEFAULT 100.00,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id                  TEXT PRIMARY KEY,          -- e.g. ORD-8823
    partner_id          TEXT REFERENCES partners(id),
    item                TEXT NOT NULL,
    category            TEXT,                      -- grocery | medicine | farm
    customer_name       TEXT,
    customer_phone      TEXT,
    pickup_address      TEXT,
    delivery_address    TEXT,
    scheduled_time      TEXT,
    status              TEXT DEFAULT 'pending',    -- pending | picked | done | cancelled
    order_amount        NUMERIC(12,2),
    commission          NUMERIC(12,2),
    tip                 NUMERIC(12,2) DEFAULT 0,
    distance_km         NUMERIC(6,2),
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    picked_at           TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       TEXT
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    label               TEXT NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,    -- positive=credit, negative=debit
    type                TEXT NOT NULL,             -- commission | payout | bonus | tip | referral | incentive
    reference           TEXT,
    order_id            TEXT REFERENCES orders(id),
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  INCENTIVES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incentives (
    id                  SERIAL PRIMARY KEY,
    title               TEXT NOT NULL,
    description         TEXT,
    type                TEXT NOT NULL,             -- streak | milestone | surge | top_performer | rain | festival
    target_value        INTEGER,
    reward_amount       NUMERIC(12,2) NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    valid_from          TEXT,
    valid_until         TEXT,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_incentives (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    incentive_id        INTEGER NOT NULL REFERENCES incentives(id),
    progress            INTEGER DEFAULT 0,
    achieved            BOOLEAN DEFAULT FALSE,
    achieved_at         TIMESTAMPTZ,
    paid                BOOLEAN DEFAULT FALSE,
    paid_at             TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
--  REFERRALS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
    id                  SERIAL PRIMARY KEY,
    referrer_id         TEXT NOT NULL REFERENCES partners(id),
    referred_id         TEXT NOT NULL REFERENCES partners(id),
    status              TEXT DEFAULT 'pending',    -- pending | qualified | paid
    referrer_bonus      NUMERIC(12,2) DEFAULT 200.00,
    referred_bonus      NUMERIC(12,2) DEFAULT 100.00,
    qualification_date  TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  EMERGENCY & HEALTH
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
    contact_name        TEXT,
    relationship        TEXT,
    phone               TEXT,
    address             TEXT
);

CREATE TABLE IF NOT EXISTS health_info (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
    blood_group         TEXT,
    allergies           TEXT,
    medical_conditions  TEXT,
    health_insurance    TEXT,
    policy_number       TEXT
);

-- ─────────────────────────────────────────────
--  AUTH TOKENS  (refresh token store)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_tokens (
    id                  SERIAL PRIMARY KEY,
    partner_id          TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    token_hash          TEXT NOT NULL,
    device_info         TEXT,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
--  INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_partner   ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_wallet_tx        ON wallet_transactions(partner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_ref    ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_part_incentives  ON partner_incentives(partner_id);

-- ─────────────────────────────────────────────
--  AUTO-UPDATE updated_at via trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['partners','documents','vehicles','bank_details','wallets'] LOOP
        EXECUTE format('
            CREATE OR REPLACE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %s
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        ', t, t);
    END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
--  SEED DATA  –  incentives
-- ─────────────────────────────────────────────
INSERT INTO incentives (title, description, type, target_value, reward_amount, is_active, valid_from, valid_until)
VALUES
  ('Welcome Bonus',         'Complete your first delivery and earn ₹50',                  'milestone',      1,   50, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('First 10 Deliveries',   'Earn ₹150 bonus after completing 10 deliveries',             'streak',        10,  150, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('50 Deliveries Badge',   'Earn ₹300 bonus after completing 50 deliveries',             'milestone',     50,  300, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('100 Deliveries Legend', 'Earn ₹600 after 100 deliveries — join the Legend tier',      'milestone',    100,  600, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('Daily 10 Streak',       'Complete 10 orders in one day — earn ₹100 bonus',            'streak',        10,  100, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('Weekend Warrior',       'Complete 15+ orders on Saturday or Sunday — earn ₹200',      'streak',        15,  200, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('Top Partner – Weekly',  'Be the top earner in your zone this week — earn ₹500',       'top_performer',  1,  500, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('Rain Allowance',        'Delivering in heavy rain? Earn ₹100 extra per rain-day',     'rain',           1,  100, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('Festival Rush Bonus',   'Double commission on all orders during festival days',        'festival',       1,    0, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT),
  ('5-Star Partner',        'Maintain 4.8+ rating for 30 days — earn ₹250',              'milestone',      1,  250, TRUE, CURRENT_DATE::TEXT, (CURRENT_DATE + INTERVAL '1 year')::TEXT)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
--  SEED DATA  –  3 demo partners
-- ─────────────────────────────────────────────
-- Passwords are bcrypt hashes of 'arjun123', 'sneha123', 'vikram123'
-- (Re-hash in production via the /api/auth/register endpoint)
INSERT INTO partners (id,name,phone,email,password_hash,dob,gender,zone,address,vehicle_type,joined_date,rating,rating_count,is_active,is_verified,referral_code)
VALUES
  ('LMH-001','Arjun Reddy','9876543210','arjun.reddy@gmail.com',
   '$2b$10$PLACEHOLDER_ARJUN','14 March 1995','Male','Vijayawada Central',
   'Flat 3B, Sunrise Apartments, MG Road, Vijayawada - 520001','Motorcycle',
   '2023-01-12',4.8,312,TRUE,TRUE,'LMH-ARJUN'),
  ('LMH-002','Sneha Patel','9123456780','sneha.patel@outlook.com',
   '$2b$10$PLACEHOLDER_SNEHA','22 July 1997','Female','Vijayawada North',
   '12, Ramalayam Street, Auto Nagar, Vijayawada - 520007','Scooter',
   '2023-04-03',4.6,189,TRUE,TRUE,'LMH-SNEHA'),
  ('LMH-003','Vikram Singh','9988776655','vikram.singh@gmail.com',
   '$2b$10$PLACEHOLDER_VIKRAM','5 November 1991','Male','Vijayawada South',
   'Plot 22, Srinivasa Nagar, Kanuru, Vijayawada - 520007','Motorcycle',
   '2022-11-19',4.9,528,TRUE,TRUE,'LMH-VIKRAM')
ON CONFLICT DO NOTHING;