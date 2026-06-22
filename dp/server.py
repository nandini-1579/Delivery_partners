#!/usr/bin/env python3
"""
LocalMart Hub  –  Backend API Server
Stack : Flask + PostgreSQL (psycopg2) + bcrypt + PyJWT
Run   : python3 server.py
Port  : 5000

Requirements:
    pip install flask flask-cors bcrypt PyJWT psycopg2-binary

Environment variables (set before running):
    DATABASE_URL  – e.g. postgresql://user:password@localhost:5432/localmart
    LMH_SECRET    – JWT signing secret (change in production)
"""

import requests as _req
import os, json, re, secrets, string
from datetime import datetime, timedelta, timezone
from functools import wraps

import psycopg2
import psycopg2.extras   # RealDictCursor — returns rows as dicts
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
import jwt
from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS

import smtplib, random, time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import base64, uuid as _uuid
# ─── CONFIG ───────────────────────────────────────────────────
BASE_DIR     = os.path.abspath(os.path.dirname(__file__))
STATIC_DIR   = os.path.join(BASE_DIR, 'static')
SECRET_KEY   = os.environ.get('LMH_SECRET', 'dev-secret-change-in-production-xyz')
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:nandini%4026@localhost:5432/localmart')
JWT_EXPIRY_HOURS = 12

app = Flask(__name__, static_folder=None)  # served manually below
CORS(app, resources={r"/api/*": {"origins": "*"}})   # tighten in production


# ═══════════════════════════════════════════════════════════════
#  FRONTEND ROUTES  –  serve index.html + static assets
# ═══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    """Serve the SPA entry point."""
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route("/app.js")
def serve_js():
    """Serve app.js with correct MIME type — explicit route avoids any ambiguity."""
    return send_from_directory(STATIC_DIR, 'app.js', mimetype='application/javascript')


@app.route("/styles.css")
def serve_css():
    """Serve styles.css with correct MIME type."""
    return send_from_directory(STATIC_DIR, 'styles.css', mimetype='text/css')


@app.route("/static/uploads/<path:filename>")
def serve_upload(filename):
    """Serve uploaded partner images permanently."""
    uploads_dir = os.path.join(STATIC_DIR, "uploads")
    filepath = os.path.join(uploads_dir, filename)
    if os.path.isfile(filepath):
        return send_from_directory(uploads_dir, filename)
    return jsonify({"error": "File not found"}), 404


@app.route("/<path:filename>")
def static_files(filename):
    """
    Catch-all for other static assets.
    Rules:
      1. Never intercept /api/* — those are handled by API routes above.
      2. For known static extensions (.js .css .png .ico .json .woff2 etc.)
         serve from static/ or return 404 — NEVER return index.html for these.
      3. For everything else (SPA client-side routes) return index.html.
    """
    # Rule 1: never catch API calls
    if filename.startswith('api/'):
        from flask import abort
        abort(404)

    # Rule 2: static asset extensions — serve or hard 404
    STATIC_EXTS = {
        '.js', '.mjs', '.css', '.map',
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
        '.woff', '.woff2', '.ttf', '.eot',
        '.json', '.xml', '.txt', '.pdf',
    }
    _, ext = os.path.splitext(filename.lower())
    if ext in STATIC_EXTS:
        filepath = os.path.join(STATIC_DIR, filename)
        if os.path.isfile(filepath):
            return send_from_directory(STATIC_DIR, filename)
        # File not found — return proper 404, NOT html
        return jsonify({"error": f"Static file not found: {filename}"}), 404

    # Rule 3: SPA fallback for client-side routes
    return send_from_directory(STATIC_DIR, 'index.html')

# ─── DB HELPERS ───────────────────────────────────────────────
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = psycopg2.connect(
            DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        db.autocommit = False
    return db

@app.teardown_appcontext
def close_db(exc):
    db = getattr(g, '_database', None)
    if db:
        if exc:
            db.rollback()
        db.close()

def query(sql, args=(), one=False):
    # psycopg2 uses %s placeholders; convert any ? to %s for safety
    sql = sql.replace('?', '%s')
    cur = get_db().cursor()
    cur.execute(sql, args)
    rv = cur.fetchall()
    return (rv[0] if rv else None) if one else rv

def execute(sql, args=()):
    sql = sql.replace('?', '%s')
    db  = get_db()
    cur = db.cursor()
    cur.execute(sql, args)
    db.commit()
    return cur

def row_to_dict(row):
    return dict(row) if row else None


INCENTIVE_SEEDS = [
    ("Welcome Bonus",         "Complete your first delivery and earn ₹50",                   "milestone",      1,   50,  True),
    ("First 10 Deliveries",   "Earn ₹150 bonus after completing 10 deliveries",              "streak",        10,  150,  True),
    ("50 Deliveries Badge",   "Earn ₹300 bonus after completing 50 deliveries",              "milestone",     50,  300,  True),
    ("100 Deliveries Legend", "Earn ₹600 after 100 deliveries — join the Legend tier",       "milestone",    100,  600,  True),
    ("Daily 10 Streak",       "Complete 10 orders in one day — earn ₹100 bonus",             "streak",        10,  100,  True),
    ("Weekend Warrior",       "Complete 15+ orders on Sat/Sun — earn ₹200",                  "streak",        15,  200,  True),
    ("Top Partner – Weekly",  "Top earner in your zone this week — earn ₹500",               "top_performer",  1,  500,  True),
    ("Rain Allowance",        "Delivering in heavy rain? Earn ₹100 extra per rain-day",      "rain",           1,  100,  True),
    ("Festival Rush",         "Double commission on all orders during festival days",         "festival",       1,    0,  True),
    ("5-Star Partner",        "Maintain 4.8+ rating for 30 days — earn ₹250",               "milestone",      1,  250,  True),
]
SLAB_SEEDS = [
    # period, slot_label, start_hour, end_hour, categories, sort_order, [(rides_required, reward_amount), ...]
    ("daily", "8:00 AM – 11:59 AM", 8, 12, "Grocery, Food, Pharmacy, Essentials", 1,
        [(5, 65), (9, 70), (12, 75)]),
    ("daily", "12:00 PM – 3:59 PM", 12, 16, "Grocery, Food, Pharmacy, Essentials", 2,
        [(5, 30), (9, 30), (12, 35)]),
    ("daily", "4:00 PM – 7:59 PM", 16, 20, "Grocery, Food, Pharmacy, Essentials", 3,
        [(5, 55), (9, 60), (12, 65)]),
    ("daily", "8:00 PM – 11:59 PM", 20, 24, "Grocery, Food, Pharmacy, Essentials", 4,
        [(4, 40), (7, 40), (10, 50)]),
    ("weekly", "Mon – Sun · 7:00 AM to 9:59 PM", 7, 22, "Grocery, Food, Pharmacy, Essentials", 1,
        [(70, 500), (90, 200), (120, 300), (170, 1000)]),
]

def init_db():
    """Create tables and seed data using the external schema_postgres.sql file,
    or fall back to running the DDL directly if the file is not present."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur  = conn.cursor()

    schema_file = os.path.join(BASE_DIR, 'schema_postgres.sql')
    if os.path.isfile(schema_file):
        with open(schema_file, 'r', encoding='utf-8') as fh:
            cur.execute(fh.read())
        print("✅ Schema applied from schema_postgres.sql")
    else:
        # Minimal inline DDL so the server starts even without the file
        cur.execute("""
            CREATE TABLE IF NOT EXISTS partners (
                id TEXT PRIMARY KEY, name TEXT NOT NULL,
                phone TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL, dob TEXT, gender TEXT, zone TEXT, address TEXT,
                vehicle_type TEXT, joined_date DATE DEFAULT CURRENT_DATE,
                rating NUMERIC(3,1) DEFAULT 5.0, rating_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE, is_verified BOOLEAN DEFAULT FALSE,
                referral_code TEXT UNIQUE, referred_by TEXT REFERENCES partners(id),
                profile_photo_url TEXT,
                latitude NUMERIC(9,6), longitude NUMERIC(9,6), location_updated_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                aadhaar TEXT, pan TEXT, driving_licence TEXT,
                rc_number TEXT, insurance_policy TEXT, puc_number TEXT, bgv_reference TEXT,
                aadhaar_img TEXT, pan_img TEXT, licence_img TEXT,
                rc_img TEXT, insurance_img TEXT, puc_img TEXT,
                aadhaar_status TEXT DEFAULT 'Pending', pan_status TEXT DEFAULT 'Pending',
                licence_status TEXT DEFAULT 'Pending', rc_status TEXT DEFAULT 'Pending',
                insurance_status TEXT DEFAULT 'Pending', puc_status TEXT DEFAULT 'Pending',
                photo_status TEXT DEFAULT 'Pending', bgv_status TEXT DEFAULT 'Pending',
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS vehicles (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
                vehicle_type TEXT, reg_number TEXT UNIQUE, colour TEXT, make TEXT, model TEXT,
                year TEXT, fuel_type TEXT, engine_cc TEXT, chassis_number TEXT, engine_number TEXT,
                rc_expiry TEXT, insurance_expiry TEXT, puc_expiry TEXT,
                insurance_valid BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS bank_details (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
                bank_name TEXT, account_holder TEXT, account_number TEXT,
                ifsc TEXT, branch TEXT, account_type TEXT DEFAULT 'Savings',
                is_verified BOOLEAN DEFAULT FALSE,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS upi_ids (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                upi_id TEXT NOT NULL, is_primary BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS wallets (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
                balance NUMERIC(12,2) DEFAULT 500.00, locked_amount NUMERIC(12,2) DEFAULT 0.00,
                total_earned NUMERIC(12,2) DEFAULT 500.00, total_withdrawn NUMERIC(12,2) DEFAULT 0.00,
                pending_settlement NUMERIC(12,2) DEFAULT 0.00,
                next_payout_date TEXT, min_withdraw NUMERIC(12,2) DEFAULT 100.00,
                min_balance NUMERIC(12,2) DEFAULT 500.00,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY, partner_id TEXT REFERENCES partners(id),
                item TEXT NOT NULL, category TEXT, customer_name TEXT, customer_phone TEXT,
                pickup_address TEXT, delivery_address TEXT, scheduled_time TEXT,
                status TEXT DEFAULT 'pending', order_amount NUMERIC(12,2), commission NUMERIC(12,2),
                tip NUMERIC(12,2) DEFAULT 0, distance_km NUMERIC(6,2),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                picked_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
                cancelled_at TIMESTAMPTZ, cancel_reason TEXT
            );
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                label TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL,
                type TEXT NOT NULL, reference TEXT, order_id TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS incentives (
                id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, type TEXT NOT NULL,
                target_value INTEGER, reward_amount NUMERIC(12,2) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE, valid_from TEXT, valid_until TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS partner_incentives (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                incentive_id INTEGER NOT NULL REFERENCES incentives(id),
                progress INTEGER DEFAULT 0, achieved BOOLEAN DEFAULT FALSE,
                achieved_at TIMESTAMPTZ, paid BOOLEAN DEFAULT FALSE, paid_at TIMESTAMPTZ
            );
            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id TEXT NOT NULL REFERENCES partners(id),
                referred_id TEXT NOT NULL REFERENCES partners(id),
                status TEXT DEFAULT 'pending',
                referrer_bonus NUMERIC(12,2) DEFAULT 200.00,
                referred_bonus NUMERIC(12,2) DEFAULT 100.00,
                days_worked INTEGER DEFAULT 0,
                qualification_date TIMESTAMPTZ, paid_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS emergency_contacts (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
                contact_name TEXT, relationship TEXT, phone TEXT, address TEXT
            );
            CREATE TABLE IF NOT EXISTS health_info (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
                blood_group TEXT, allergies TEXT, medical_conditions TEXT,
                health_insurance TEXT, policy_number TEXT
            );
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL, device_info TEXT, expires_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_orders_partner  ON orders(partner_id);
            CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_wallet_tx       ON wallet_transactions(partner_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_referrals_ref   ON referrals(referrer_id);
            CREATE TABLE IF NOT EXISTS incentive_slabs (
                id SERIAL PRIMARY KEY,
                period TEXT NOT NULL,
                slot_label TEXT,
                slot_start_hour INTEGER,
                slot_end_hour INTEGER,
                categories TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS incentive_tiers (
                id SERIAL PRIMARY KEY,
                slab_id INTEGER NOT NULL REFERENCES incentive_slabs(id) ON DELETE CASCADE,
                rides_required INTEGER NOT NULL,
                reward_amount NUMERIC(12,2) NOT NULL,
                sort_order INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS incentive_payouts (
                id SERIAL PRIMARY KEY,
                partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
                tier_id INTEGER NOT NULL REFERENCES incentive_tiers(id) ON DELETE CASCADE,
                period_key TEXT NOT NULL,
                paid_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(partner_id, tier_id, period_key)
            );
            CREATE INDEX IF NOT EXISTS idx_incentive_tiers_slab     ON incentive_tiers(slab_id);
            CREATE INDEX IF NOT EXISTS idx_incentive_payouts_part   ON incentive_payouts(partner_id);
            CREATE INDEX IF NOT EXISTS idx_part_incentives ON partner_incentives(partner_id);
        """)
        print("✅ Schema applied from inline DDL")

    # Add image URL columns to documents if upgrading from old schema (migration)
    for col in ["aadhaar_img","pan_img","licence_img","rc_img","insurance_img","puc_img"]:
        try:
            cur.execute(f"ALTER TABLE documents ADD COLUMN IF NOT EXISTS {col} TEXT")
        except Exception:
            pass

    # pending_topups table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_topups (
            id          SERIAL PRIMARY KEY,
            partner_id  TEXT NOT NULL,
            reference   TEXT NOT NULL UNIQUE,
            amount      NUMERIC(12,2) NOT NULL,
            method      TEXT NOT NULL,
            status      TEXT DEFAULT 'pending',
            utr         TEXT,
            created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            expires_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 minutes'
        )
    """)

    # Seed incentives
    for seed in INCENTIVE_SEEDS:
        cur.execute(
            """INSERT INTO incentives (title,description,type,target_value,reward_amount,is_active)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT DO NOTHING""",
            seed
        )
    # Seed incentive slabs (Daily / Weekly tiered incentives)
    for period, label, sh, eh, cats, sort_order, tiers in SLAB_SEEDS:
        cur.execute("SELECT id FROM incentive_slabs WHERE period=%s AND slot_label=%s", (period, label))
        row = cur.fetchone()
        if row:
            slab_id = row[0]
        else:
            cur.execute(
                "INSERT INTO incentive_slabs (period, slot_label, slot_start_hour, slot_end_hour, categories, sort_order) "
                "VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                (period, label, sh, eh, cats, sort_order))
            slab_id = cur.fetchone()[0]
        for rides, reward in tiers:
            cur.execute(
                "INSERT INTO incentive_tiers (slab_id, rides_required, reward_amount, sort_order) "
                "SELECT %s,%s,%s,%s WHERE NOT EXISTS "
                "(SELECT 1 FROM incentive_tiers WHERE slab_id=%s AND rides_required=%s)",
                (slab_id, rides, reward, rides, slab_id, rides))

    # Seed demo partners
    demo = [
        ("LMH-001","Arjun Reddy","9876543210","arjun.reddy@gmail.com","arjun123",
         "14 March 1995","Male","Vijayawada Central",
         "Flat 3B, Sunrise Apartments, MG Road, Vijayawada - 520001","Motorcycle","2023-01-12",4.8,312,"LMH-ARJUN"),
        ("LMH-002","Sneha Patel","9123456780","sneha.patel@outlook.com","sneha123",
         "22 July 1997","Female","Vijayawada North",
         "12, Ramalayam Street, Auto Nagar, Vijayawada - 520007","Scooter","2023-04-03",4.6,189,"LMH-SNEHA"),
        ("LMH-003","Vikram Singh","9988776655","vikram.singh@gmail.com","vikram123",
         "5 November 1991","Male","Vijayawada South",
         "Plot 22, Srinivasa Nagar, Kanuru, Vijayawada - 520007","Motorcycle","2022-11-19",4.9,528,"LMH-VIKRAM"),
    ]
    for d in demo:
        cur.execute("SELECT id FROM partners WHERE id=%s", (d[0],))
        if not cur.fetchone():
            ph = bcrypt.hashpw(d[4].encode(), bcrypt.gensalt()).decode()
            cur.execute(
                """INSERT INTO partners (id,name,phone,email,password_hash,dob,gender,zone,
                   address,vehicle_type,joined_date,rating,rating_count,is_active,is_verified,referral_code)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,TRUE,TRUE,%s)""",
                (d[0], d[1], d[2], d[3], ph, d[5], d[6], d[7], d[8], d[9], d[10], d[11], d[12], d[13])
            )
            cur.execute(
                "INSERT INTO wallets (partner_id,balance,total_earned,total_withdrawn) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (d[0], 1000, 50000, 49000)
            )

    conn.commit()
    cur.close()
    conn.close()

# ─── JWT ──────────────────────────────────────────────────────
def make_token(partner_id):
    payload = {
        "sub": partner_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth  = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
        if not token:
            return jsonify({"error": "Authorisation required"}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            g.partner_id = data["sub"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired — please log in again"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated

# ─── UTILS ────────────────────────────────────────────────────
def gen_partner_id():
    existing = [r["id"] for r in query("SELECT id FROM partners")]
    nums = []
    for e in existing:
        m = re.match(r"LMH-(\d+)", e)
        if m: nums.append(int(m.group(1)))
    nxt = max(nums, default=0) + 1
    return f"LMH-{nxt:03d}"

def gen_referral_code(name):
    base = re.sub(r"[^A-Z]", "", name.upper())[:6]
    suffix = secrets.token_hex(2).upper()
    return f"LMH-{base}{suffix}"

def err(msg, code=400):
    return jsonify({"error": msg}), code

def ok(data={}, msg="Success"):
    return jsonify({"success": True, "message": msg, **data})

# ─── VALIDATION HELPERS ────────────────────────────────────────
def validate_phone(phone):
    """Indian mobile: 10 digits, starts with 6-9."""
    return bool(re.match(r"^[6-9]\d{9}$", phone))

def validate_email(email):
    """Basic email format check."""
    return bool(re.match(r"^[\w.+\-]+@[\w\-]+\.[a-z]{2,}$", email.lower()))

def validate_aadhaar(aadhaar):
    """Aadhaar: exactly 12 digits, not all same digit."""
    if not re.match(r"^\d{12}$", aadhaar): return False
    return len(set(aadhaar)) > 1

def validate_pan(pan):
    """PAN: AAAAA9999A format."""
    return bool(re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", pan.upper()))

def validate_account_number(acc):
    """Bank account: 9-18 digits."""
    return bool(re.match(r"^\d{9,18}$", acc))

def validate_ifsc(ifsc):
    """IFSC: 4 letters + 0 + 6 alphanumeric."""
    return bool(re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc.upper()))

def luhn_check(card_num):
    """Luhn algorithm for card validation (not used yet but available)."""
    digits = [int(d) for d in str(card_num)][::-1]
    return sum(d if i%2==0 else (d*2-9 if d*2>9 else d*2) for i,d in enumerate(digits)) % 10 == 0

# ═══════════════════════════════════════════════════════════════
#  AUTH ROUTES
# ═══════════════════════════════════════════════════════════════

@app.route("/api/auth/register", methods=["POST"])
def register():
    """Register a new delivery partner."""
    body = request.get_json(silent=True) or {}
    required = ["name", "phone", "email", "password"]
    for f in required:
        if not body.get(f):
            return err(f"Field '{f}' is required")

    phone = body["phone"].strip()
    email = body["email"].strip().lower()

    # Validate phone (Indian mobile format)
    if not validate_phone(phone):
        return err("Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9")

    # Validate email format
    if not validate_email(email):
        return err("Enter a valid email address (e.g. name@example.com)")

    if len(body["password"]) < 6:
        return err("Password must be at least 6 characters")

    # Check duplicates
    if query("SELECT id FROM partners WHERE phone=%s", (phone,), one=True):
        return err("A partner with this phone number already exists")
    if query("SELECT id FROM partners WHERE email=%s", (email,), one=True):
        return err("A partner with this email already exists")

    # Referral lookup
    referred_by = None
    if body.get("referral_code"):
        ref_partner = query("SELECT id FROM partners WHERE referral_code=%s",
                            (body["referral_code"].strip().upper(),), one=True)
        if ref_partner:
            referred_by = ref_partner["id"]

    pid  = gen_partner_id()
    ph   = bcrypt.hashpw(body["password"].encode(), bcrypt.gensalt()).decode()
    code = gen_referral_code(body["name"])

    execute(
        """INSERT INTO partners (id,name,phone,email,password_hash,dob,gender,zone,
           address,vehicle_type,referral_code,referred_by,is_active,is_verified)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,TRUE,FALSE)""",
        (pid, body["name"].strip(), phone, email, ph,
         body.get("dob"), body.get("gender"), body.get("zone"),
         body.get("address"), body.get("vehicle_type"), code, referred_by)
    )
    # Create wallet
    execute("INSERT INTO wallets (partner_id) VALUES (%s)", (pid,))

    # Handle referral record
    if referred_by:
        execute(
            "INSERT INTO referrals (referrer_id,referred_id) VALUES (%s,%s)",
            (referred_by, pid)
        )
        # NO instant bonus — referrer gets paid after referred partner works 5 days
        # Referred partner gets notified about the 5-day requirement

    token = make_token(pid)
    partner_row = row_to_dict(query("SELECT * FROM partners WHERE id=%s", (pid,), one=True))
    partner_row.pop("password_hash", None)
    return ok({"token": token, "partner": partner_row}, "Registration successful"), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Login with phone + password."""
    body  = request.get_json(silent=True) or {}
    phone = (body.get("phone") or "").strip()
    pwd   = (body.get("password") or "").strip()
    if not phone or not pwd:
        return err("Phone and password are required")

    partner = query("SELECT * FROM partners WHERE phone=%s", (phone,), one=True)
    if not partner:
        return err("Invalid phone number or password", 401)

    if not bcrypt.checkpw(pwd.encode(), partner["password_hash"].encode()):
        return err("Invalid phone number or password", 401)

    if not partner["is_active"]:
        return err("Your account has been deactivated. Contact support.", 403)

    token = make_token(partner["id"])
    partner_dict = row_to_dict(partner)
    partner_dict.pop("password_hash", None)
    return ok({"token": token, "partner": partner_dict})

@app.route("/api/auth/send-otp", methods=["POST"])
def send_otp():
    body  = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    if not email or not validate_email(email):
        return err("Enter a valid email address")
    existing = query("SELECT id FROM partners WHERE email=%s", (email,), one=True)
    if existing:
        return err("This email is already registered. Use a different email.")
    otp = str(random.randint(100000, 999999))
    otp_store[email] = {"otp": otp, "expires_at": time.time() + 300}
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "LocalMart Hub – Email Verification OTP"
        msg["From"]    = SMTP_EMAIL
        msg["To"]      = email
        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#f8faff;border-radius:16px">
          <div style="font-size:22px;font-weight:800;color:#1A6FE8">LocalMart Hub</div>
          <div style="font-size:15px;color:#444;margin:16px 0">Your email verification OTP is:</div>
          <div style="font-size:42px;font-weight:900;letter-spacing:10px;color:#1A6FE8;margin:20px 0">{otp}</div>
          <div style="font-size:13px;color:#888">Valid for 5 minutes. Do not share this with anyone.</div>
        </div>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(SMTP_EMAIL, SMTP_PASSWORD)
            s.sendmail(SMTP_EMAIL, email, msg.as_string())
        return ok(msg="OTP sent to your email")
    except Exception as e:
        return err(f"Failed to send OTP: {str(e)}")


@app.route("/api/auth/verify-otp", methods=["POST"])
def verify_otp():
    body  = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    otp   = (body.get("otp") or "").strip()
    entry = otp_store.get(email)
    if not entry:
        return err("No OTP found for this email. Request a new one.")
    if time.time() > entry["expires_at"]:
        otp_store.pop(email, None)
        return err("OTP expired. Request a new one.")
    if entry["otp"] != otp:
        return err("Incorrect OTP. Please try again.")
    otp_store.pop(email, None)
    return ok(msg="Email verified successfully")

SMTP_EMAIL    = "blazrlit@gmail.com"
SMTP_PASSWORD = "szyp qcnn vgzb qlum"
otp_store     = {}

# ─── SMS / OTP CONFIG ─────────────────────────────────────────
# Option A – Twilio (free trial at twilio.com, no credit card)
TWILIO_SID   = os.environ.get('TWILIO_SID',   '')
TWILIO_TOKEN = os.environ.get('TWILIO_TOKEN', '')
TWILIO_FROM  = os.environ.get('TWILIO_FROM',  '')   # e.g. +12345678900

phone_otp_store = {}   # { phone: { otp, expires_at, partner_id } }

# ═══════════════════════════════════════════════════════════════
#  PROFILE ROUTES
# ═══════════════════════════════════════════════════════════════

@app.route("/api/profile", methods=["GET"])
@require_auth
def get_profile():
    """Return full partner profile."""
    pid = g.partner_id
    p   = row_to_dict(query("SELECT * FROM partners WHERE id=%s", (pid,), one=True))
    if not p:
        return err("Partner not found", 404)
    p.pop("password_hash", None)

    p["documents"]       = row_to_dict(query("SELECT * FROM documents WHERE partner_id=%s",       (pid,), one=True))
    p["vehicle_details"] = row_to_dict(query("SELECT * FROM vehicles   WHERE partner_id=%s",       (pid,), one=True))
    p["bank"]            = row_to_dict(query("SELECT * FROM bank_details WHERE partner_id=%s",     (pid,), one=True))
    p["upi_ids"]         = [r["upi_id"] for r in query("SELECT upi_id FROM upi_ids WHERE partner_id=%s ORDER BY is_primary DESC", (pid,))]
    p["wallet"]          = row_to_dict(query("SELECT * FROM wallets WHERE partner_id=%s",          (pid,), one=True))
    p["emergency"]       = row_to_dict(query("SELECT * FROM emergency_contacts WHERE partner_id=%s",(pid,), one=True))
    p["health"]          = row_to_dict(query("SELECT * FROM health_info WHERE partner_id=%s",       (pid,), one=True))
    return ok({"profile": p})


@app.route("/api/profile/personal", methods=["PUT"])
@require_auth
def update_personal():
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}
    allowed = ["name","email","dob","gender","zone","address","vehicle_type"]
    sets  = [f"{k}=%s" for k in allowed if k in body]
    vals  = [body[k]  for k in allowed if k in body]
    if not sets:
        return err("Nothing to update")
    vals.append(pid)
    execute(f"UPDATE partners SET {','.join(sets)}, updated_at=CURRENT_TIMESTAMP WHERE id=%s", vals)
    return ok(msg="Profile updated")


@app.route("/api/profile/documents", methods=["PUT"])
@require_auth
def update_documents():
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}

    # Validate Aadhaar if provided
    if body.get("aadhaar"):
        if not validate_aadhaar(body["aadhaar"].strip()):
            return err("Aadhaar must be exactly 12 digits and cannot be all same digits")

    # Validate PAN if provided
    if body.get("pan"):
        if not validate_pan(body["pan"].strip()):
            return err("Invalid PAN format. Expected format: ABCDE1234F")

    fields = ["aadhaar","pan","driving_licence","rc_number","insurance_policy","puc_number","bgv_reference"]
    exists = query("SELECT id FROM documents WHERE partner_id=%s", (pid,), one=True)
    if exists:
        sets = [f"{k}=%s" for k in fields if k in body]
        vals = [body[k]  for k in fields if k in body]
        if sets:
            vals.append(pid)
            execute(f"UPDATE documents SET {','.join(sets)}, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s", vals)
    else:
        cols = ["partner_id"] + [k for k in fields if k in body]
        vals = [pid] + [body[k] for k in fields if k in body]
        ph   = ",".join(["%s"] * len(vals))
        execute(f"INSERT INTO documents ({','.join(cols)}) VALUES ({ph})", vals)
    return ok(msg="Documents updated — pending verification")


@app.route("/api/profile/vehicle", methods=["PUT"])
@require_auth
def update_vehicle():
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}
    fields = ["vehicle_type","reg_number","colour","make","model","year","fuel_type",
              "engine_cc","chassis_number","engine_number","rc_expiry","insurance_expiry","puc_expiry","insurance_valid"]
    try:
        exists = query("SELECT id FROM vehicles WHERE partner_id=%s", (pid,), one=True)
        if exists:
            sets = [f"{k}=%s" for k in fields if k in body]
            vals = [body[k]  for k in fields if k in body]
            if sets:
                vals.append(pid)
                execute(f"UPDATE vehicles SET {','.join(sets)}, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s", vals)
        else:
            cols = ["partner_id"] + [k for k in fields if k in body]
            vals = [pid] + [body[k] for k in fields if k in body]
            ph   = ",".join(["%s"] * len(vals))
            execute(f"INSERT INTO vehicles ({','.join(cols)}) VALUES ({ph}) ON CONFLICT (partner_id) DO UPDATE SET {', '.join([f'{k}=EXCLUDED.{k}' for k in fields if k in body])}, updated_at=CURRENT_TIMESTAMP", vals)
    except Exception as e:
        return err(f"Failed to save vehicle details: {str(e)}")
    # Also update vehicle_type in partners table
    if body.get("vehicle_type"):
        execute("UPDATE partners SET vehicle_type=%s WHERE id=%s", (body["vehicle_type"], pid))
    return ok(msg="Vehicle details updated")


@app.route("/api/profile/bank", methods=["PUT"])
@require_auth
def update_bank():
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}

    # Validate account number if provided
    if body.get("account_number"):
        if not validate_account_number(body["account_number"].strip()):
            return err("Bank account number must be 9–18 digits only")

    # Validate IFSC if provided
    if body.get("ifsc"):
        if not validate_ifsc(body["ifsc"].strip()):
            return err("Invalid IFSC code format (e.g. SBIN0001234)")

    fields = ["bank_name","account_holder","account_number","ifsc","branch","account_type"]
    exists = query("SELECT id FROM bank_details WHERE partner_id=%s", (pid,), one=True)
    if exists:
        sets = [f"{k}=%s" for k in fields if k in body]
        vals = [body[k]  for k in fields if k in body]
        if sets:
            vals.append(pid)
            execute(f"UPDATE bank_details SET {','.join(sets)},is_verified=FALSE,updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s", vals)
    else:
        cols = ["partner_id"] + [k for k in fields if k in body]
        vals = [pid] + [body[k] for k in fields if k in body]
        ph   = ",".join(["%s"] * len(vals))
        execute(f"INSERT INTO bank_details ({','.join(cols)}) VALUES ({ph})", vals)

    if body.get("upi_id"):
        execute("UPDATE upi_ids SET is_primary=FALSE WHERE partner_id=%s", (pid,))
        exists_upi = query("SELECT id FROM upi_ids WHERE partner_id=%s AND upi_id=%s", (pid, body["upi_id"]), one=True)
        if not exists_upi:
            execute("INSERT INTO upi_ids (partner_id,upi_id,is_primary) VALUES (%s,%s,TRUE)", (pid, body["upi_id"]))
        else:
            execute("UPDATE upi_ids SET is_primary=TRUE WHERE partner_id=%s AND upi_id=%s", (pid, body["upi_id"]))
    return ok(msg="Bank details updated — pending verification (3 business days)")


@app.route("/api/profile/emergency", methods=["PUT"])
@require_auth
def update_emergency():
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}
    ec_fields = ["contact_name","relationship","phone","address"]
    hi_fields = ["blood_group","allergies","medical_conditions","health_insurance","policy_number"]

    ec_exists = query("SELECT id FROM emergency_contacts WHERE partner_id=%s", (pid,), one=True)
    ec_vals   = [body[k] for k in ec_fields if k in body]
    if ec_vals:
        if ec_exists:
            sets = [f"{k}=%s" for k in ec_fields if k in body]
            execute(f"UPDATE emergency_contacts SET {','.join(sets)} WHERE partner_id=%s", ec_vals + [pid])
        else:
            cols = ["partner_id"] + [k for k in ec_fields if k in body]
            ph   = ",".join(["%s"] * len(cols))
            execute(f"INSERT INTO emergency_contacts ({','.join(cols)}) VALUES ({ph})", [pid] + ec_vals)

    hi_exists = query("SELECT id FROM health_info WHERE partner_id=%s", (pid,), one=True)
    hi_vals   = [body[k] for k in hi_fields if k in body]
    if hi_vals:
        if hi_exists:
            sets = [f"{k}=%s" for k in hi_fields if k in body]
            execute(f"UPDATE health_info SET {','.join(sets)} WHERE partner_id=%s", hi_vals + [pid])
        else:
            cols = ["partner_id"] + [k for k in hi_fields if k in body]
            ph   = ",".join(["%s"] * len(cols))
            execute(f"INSERT INTO health_info ({','.join(cols)}) VALUES ({ph})", [pid] + hi_vals)

    return ok(msg="Emergency & health info updated")


# ═══════════════════════════════════════════════════════════════
#  ORDERS
# ═══════════════════════════════════════════════════════════════

@app.route("/api/orders", methods=["GET"])
@require_auth
def get_orders():
    pid    = g.partner_id
    status = request.args.get("status")
    if status:
        # Show pending (unassigned) orders + this partner's own orders
        rows = query("""
            SELECT * FROM orders
            WHERE status=%s AND (partner_id=%s OR partner_id IS NULL)
            ORDER BY created_at DESC
        """, (status, pid))
    else:
        # Show all unassigned pending orders + all of this partner's orders
        rows = query("""
            SELECT * FROM orders
            WHERE (partner_id=%s)
               OR (partner_id IS NULL AND status='pending')
            ORDER BY created_at DESC
        """, (pid,))
    return ok({"orders": [dict(r) for r in rows]})


@app.route("/api/orders/<order_id>/status", methods=["PUT"])
@require_auth
def update_order_status(order_id):
    pid    = g.partner_id
    body   = request.get_json(silent=True) or {}
    status = body.get("status")
    if status not in ("picked", "done", "cancelled"):
        return err("Invalid status")

    order = query("SELECT * FROM orders WHERE id=%s", (order_id,), one=True)
    if not order:
        return err("Order not found", 404)

# If order is pending and unassigned — assign it to this partner
    if order["status"] == "pending" and not order["partner_id"]:
        execute("UPDATE orders SET partner_id=%s WHERE id=%s", (pid, order_id))
        order = query("SELECT * FROM orders WHERE id=%s", (order_id,), one=True)

# Block if assigned to someone else
    if order["partner_id"] != pid:
        return err("Order already taken by another partner", 403)

    ts_col = {"picked": "picked_at", "done": "delivered_at", "cancelled": "cancelled_at"}.get(status)
    extra  = f", {ts_col}=CURRENT_TIMESTAMP" if ts_col else ""
    execute(f"UPDATE orders SET status=%s{extra} WHERE id=%s", (status, order_id))

    # On delivery — credit commission to wallet
    if status == "done":
        commission = order["commission"] or 0
        execute("UPDATE wallets SET balance=balance+%s, total_earned=total_earned+%s, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s",
                (commission, commission, pid))
        execute("INSERT INTO wallet_transactions (partner_id,label,amount,type,reference,order_id) VALUES (%s,%s,%s,%s,%s,%s)",
                (pid, f"Commission – {order_id}", commission, "commission", f"TXN-{order_id}", order_id))
        _check_incentives(pid)
        _check_incentive_slabs(pid) 
        _check_referral_days(pid)  # Track 5-day referral requirement
    sync_status_to_blazrlit(order_id, status) 
    return ok(msg=f"Order {order_id} marked as {status}")


# ═══════════════════════════════════════════════════════════════
#  WALLET
# ═══════════════════════════════════════════════════════════════

@app.route("/api/wallet", methods=["GET"])
@require_auth
def get_wallet():
    pid = g.partner_id
    w   = row_to_dict(query("SELECT * FROM wallets WHERE partner_id=%s", (pid,), one=True))
    txs = [dict(r) for r in query(
        "SELECT * FROM wallet_transactions WHERE partner_id=%s ORDER BY created_at DESC LIMIT 50", (pid,))]
    return ok({"wallet": w, "transactions": txs})


@app.route("/api/wallet/withdraw", methods=["POST"])
@require_auth
def withdraw():
    pid    = g.partner_id
    body   = request.get_json(silent=True) or {}
    amount = float(body.get("amount", 0))
    w      = query("SELECT * FROM wallets WHERE partner_id=%s", (pid,), one=True)
    if not w:
        return err("Wallet not found", 404)
    if amount < w["min_withdraw"]:
        return err(f"Minimum withdrawal is ₹{w['min_withdraw']}")
    min_bal = w.get("min_balance") or 500.0
    if amount > (w["balance"] - min_bal):
        return err(f"Insufficient balance. You must maintain a minimum balance of ₹{min_bal:.0f} in your wallet")
    bank = query("SELECT * FROM bank_details WHERE partner_id=%s", (pid,), one=True)
    if not bank:
        return err("Please add your bank account details first")
    ref = "PAY-" + secrets.token_hex(4).upper()
    execute("UPDATE wallets SET balance=balance-%s, total_withdrawn=total_withdrawn+%s, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s",
            (amount, amount, pid))
    execute("INSERT INTO wallet_transactions (partner_id,label,amount,type,reference) VALUES (%s,%s,%s,%s,%s)",
            (pid, "Withdrawal to bank", -amount, "payout", ref))
    return ok({"reference": ref}, f"Withdrawal of ₹{amount:,.0f} initiated. Will credit in 2 business days.")


# ═══════════════════════════════════════════════════════════════
#  INCENTIVES
# ═══════════════════════════════════════════════════════════════

@app.route("/api/incentives", methods=["GET"])
@require_auth
def get_incentives():
    pid    = g.partner_id
    all_i  = query("SELECT * FROM incentives WHERE is_active=TRUE ORDER BY reward_amount DESC")
    # Get partner's progress for each
    result = []
    for i in all_i:
        pi = query("SELECT * FROM partner_incentives WHERE partner_id=%s AND incentive_id=%s",
                   (pid, i["id"]), one=True)
        row = dict(i)
        row["progress"]  = pi["progress"]  if pi else 0
        row["achieved"]  = pi["achieved"]  if pi else 0
        row["paid"]      = pi["paid"]      if pi else 0
        result.append(row)
    return ok({"incentives": result})
@app.route("/api/incentives/slabs", methods=["GET"])
@require_auth
def get_incentive_slabs():
    pid    = g.partner_id
    period = request.args.get("period", "daily")
    date_str = request.args.get("date")
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.now().date()
    except ValueError:
        target_date = datetime.now().date()

    slabs = query("SELECT * FROM incentive_slabs WHERE period=%s AND is_active=TRUE ORDER BY sort_order", (period,))
    result = []
    for slab in slabs:
        tiers = query("SELECT * FROM incentive_tiers WHERE slab_id=%s ORDER BY sort_order, rides_required", (slab["id"],))

        if period == "daily":
            rides_done = query("""
                SELECT COUNT(*) AS c FROM orders
                WHERE partner_id=%s AND status='done'
                  AND delivered_at::date = %s
                  AND EXTRACT(HOUR FROM delivered_at) >= %s
                  AND EXTRACT(HOUR FROM delivered_at) < %s
            """, (pid, target_date, slab["slot_start_hour"], slab["slot_end_hour"]), one=True)["c"]
            period_key = f"{target_date.isoformat()}-slab{slab['id']}"
        else:
            week_start = target_date - timedelta(days=target_date.weekday())
            week_end   = week_start + timedelta(days=6)
            rides_done = query("""
                SELECT COUNT(*) AS c FROM orders
                WHERE partner_id=%s AND status='done'
                  AND delivered_at::date BETWEEN %s AND %s
            """, (pid, week_start, week_end), one=True)["c"]
            period_key = f"{week_start.isoformat()}-slab{slab['id']}"

        tier_rows = []
        for t in tiers:
            paid = query("SELECT id FROM incentive_payouts WHERE partner_id=%s AND tier_id=%s AND period_key=%s",
                          (pid, t["id"], period_key), one=True)
            tier_rows.append({
                "rides_required": t["rides_required"],
                "reward_amount":  float(t["reward_amount"]),
                "achieved": rides_done >= t["rides_required"],
                "paid": bool(paid),
                "remaining": max(0, t["rides_required"] - rides_done),
            })

        max_reward = sum(t["reward_amount"] for t in tier_rows)
        max_rides  = tier_rows[-1]["rides_required"] if tier_rows else 0

        result.append({
            "id": slab["id"],
            "slot_label": slab["slot_label"],
            "categories": slab["categories"],
            "rides_done": rides_done,
            "max_reward": max_reward,
            "max_rides": max_rides,
            "tiers": tier_rows,
        })

    return ok({"period": period, "date": target_date.isoformat(), "slabs": result})


def _credit_reached_tiers(partner_id, slab_id, rides_done, period_key):
    tiers = query("SELECT * FROM incentive_tiers WHERE slab_id=%s AND rides_required<=%s ORDER BY rides_required",
                   (slab_id, rides_done))
    for t in tiers:
        already = query("SELECT id FROM incentive_payouts WHERE partner_id=%s AND tier_id=%s AND period_key=%s",
                         (partner_id, t["id"], period_key), one=True)
        if already:
            continue
        amt = float(t["reward_amount"])
        execute("INSERT INTO incentive_payouts (partner_id, tier_id, period_key) VALUES (%s,%s,%s)",
                (partner_id, t["id"], period_key))
        execute("UPDATE wallets SET balance=balance+%s, total_earned=total_earned+%s, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s",
                (amt, amt, partner_id))
        execute("INSERT INTO wallet_transactions (partner_id,label,amount,type,reference) VALUES (%s,%s,%s,%s,%s)",
                (partner_id, f"Incentive bonus – {t['rides_required']} deliveries", amt, "incentive", period_key))


def _check_incentive_slabs(partner_id):
    """Called after every delivery — auto-credit any newly-reached daily/weekly incentive tiers."""
    now  = datetime.now()
    d    = now.date()
    hour = now.hour

    daily_slabs = query("""
        SELECT * FROM incentive_slabs
        WHERE period='daily' AND is_active=TRUE AND %s >= slot_start_hour AND %s < slot_end_hour
    """, (hour, hour))
    for slab in daily_slabs:
        rides_done = query("""
            SELECT COUNT(*) AS c FROM orders
            WHERE partner_id=%s AND status='done' AND delivered_at::date=%s
              AND EXTRACT(HOUR FROM delivered_at) >= %s AND EXTRACT(HOUR FROM delivered_at) < %s
        """, (partner_id, d, slab["slot_start_hour"], slab["slot_end_hour"]), one=True)["c"]
        period_key = f"{d.isoformat()}-slab{slab['id']}"
        _credit_reached_tiers(partner_id, slab["id"], rides_done, period_key)

    week_start = d - timedelta(days=d.weekday())
    week_end   = week_start + timedelta(days=6)
    weekly_slabs = query("SELECT * FROM incentive_slabs WHERE period='weekly' AND is_active=TRUE")
    for slab in weekly_slabs:
        rides_done = query("""
            SELECT COUNT(*) AS c FROM orders
            WHERE partner_id=%s AND status='done' AND delivered_at::date BETWEEN %s AND %s
        """, (partner_id, week_start, week_end), one=True)["c"]
        period_key = f"{week_start.isoformat()}-slab{slab['id']}"
        _credit_reached_tiers(partner_id, slab["id"], rides_done, period_key)

def _check_incentives(partner_id):
    """Only credit a ONE-TIME welcome bonus after the partner's first delivered order."""
    done_count = query(
        "SELECT COUNT(*) as c FROM orders WHERE partner_id=%s AND status='done'",
        (partner_id,), one=True)["c"]

    # Only act on the very first delivery
    if done_count != 1:
        return

    # Check welcome bonus not already given
    already = query(
        "SELECT id FROM wallet_transactions WHERE partner_id=%s AND reference=%s",
        (partner_id, "WELCOME-BONUS"), one=True)
    if already:
        return

    welcome = query("SELECT * FROM incentives WHERE title='Welcome Bonus'", one=True)
    if not welcome:
        return

    amt = welcome["reward_amount"]
    execute("UPDATE wallets SET balance=balance+%s, total_earned=total_earned+%s WHERE partner_id=%s",
            (amt, amt, partner_id))
    execute("""INSERT INTO wallet_transactions (partner_id,label,amount,type,reference)
               VALUES (%s,%s,%s,%s,%s)""",
            (partner_id, "Bonus – Welcome Bonus", amt, "bonus", "WELCOME-BONUS"))


@app.route("/api/referrals/qualify/<referred_id>", methods=["POST"])
@require_auth
def qualify_referral(referred_id):
    """Mark a referral as qualified (called internally when referred partner hits 10 deliveries)."""
    ref = query("SELECT * FROM referrals WHERE referred_id=%s AND status='pending'", (referred_id,), one=True)
    if not ref:
        return err("No pending referral found")
    execute("UPDATE referrals SET status='qualified', qualification_date=CURRENT_TIMESTAMP WHERE id=%s", (ref["id"],))
    # Credit referrer bonus
    bonus = ref["referrer_bonus"]
    execute("UPDATE wallets SET balance=balance+%s, total_earned=total_earned+%s WHERE partner_id=%s",
            (bonus, bonus, ref["referrer_id"]))
    execute("INSERT INTO wallet_transactions (partner_id,label,amount,type) VALUES (%s,%s,%s,%s)",
            (ref["referrer_id"], f"Referral bonus – partner {referred_id}", bonus, "referral"))
    execute("UPDATE referrals SET status='paid', paid_at=CURRENT_TIMESTAMP WHERE id=%s", (ref["id"],))
    return ok(msg="Referral qualified and bonus credited")


# ═══════════════════════════════════════════════════════════════
#  EARNINGS SUMMARY
# ═══════════════════════════════════════════════════════════════

@app.route("/api/earnings", methods=["GET"])
@require_auth
def get_earnings():
    pid   = g.partner_id
    today = datetime.now().strftime("%Y-%m-%d")

    # TODAY's orders (for daily earnings card)
    orders_today = query(
        "SELECT * FROM orders WHERE partner_id=%s AND DATE(created_at)=%s", (pid, today))
    done_today       = [o for o in orders_today if o["status"] == "done"]
    pending_today    = [o for o in orders_today if o["status"] == "pending"]
    in_transit_today = [o for o in orders_today if o["status"] == "picked"]
    today_earn       = sum(o["commission"] or 0 for o in done_today)
    
    # YESTERDAY's orders
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    orders_yesterday = query(
        "SELECT * FROM orders WHERE partner_id=%s AND DATE(delivered_at)=%s AND status='done'", (pid, yesterday))
    yesterday_earn = sum(o["commission"] or 0 for o in orders_yesterday)
    yesterday_count = len(orders_yesterday)
    # Yesterday's delivered/pending/transit counts
    orders_yesterday_all = query(
        "SELECT * FROM orders WHERE partner_id=%s AND DATE(created_at)=%s", (pid, yesterday))
    yesterday_delivered   = len([o for o in orders_yesterday_all if o["status"] == "done"])
    yesterday_pending     = len([o for o in orders_yesterday_all if o["status"] == "pending"])
    yesterday_in_transit  = len([o for o in orders_yesterday_all if o["status"] == "picked"])
    
    # ALL-TIME totals (never resets — counts every order ever)
    total_delivered = query(
        "SELECT COUNT(*) as c FROM orders WHERE partner_id=%s AND status='done'",
        (pid,), one=True)["c"] or 0

    total_pending = query(
        "SELECT COUNT(*) as c FROM orders WHERE partner_id=%s AND status='pending'",
        (pid,), one=True)["c"] or 0

    total_in_transit = query(
        "SELECT COUNT(*) as c FROM orders WHERE partner_id=%s AND status='picked'",
        (pid,), one=True)["c"] or 0

    total_earnings = query(
        "SELECT COALESCE(SUM(commission),0) as total FROM orders WHERE partner_id=%s AND status='done'",
        (pid,), one=True)["total"] or 0

    # This week's earnings (Mon–today)
    week_start = (datetime.now() - timedelta(days=datetime.now().weekday())).strftime("%Y-%m-%d")
    week_orders = query(
        "SELECT commission FROM orders WHERE partner_id=%s AND status='done' AND DATE(delivered_at)>=%s",
        (pid, week_start))
    week_earn = sum(o["commission"] or 0 for o in week_orders)

    w = row_to_dict(query("SELECT * FROM wallets WHERE partner_id=%s", (pid,), one=True))

    return ok({
        "today":              today_earn,
        "today_count":        len(done_today),
        "today_delivered":    len(done_today),
        "today_pending":      len(pending_today),
        "today_in_transit":   len(in_transit_today),

        "yesterday":            yesterday_earn,
        "yesterday_count":      yesterday_count,
        "yesterday_delivered":  yesterday_delivered,
        "yesterday_pending":    yesterday_pending,
        "yesterday_in_transit": yesterday_in_transit,

        "total_delivered":    total_delivered,
        "total_pending":      total_pending,
        "total_in_transit":   total_in_transit,
        "total_earnings":     float(total_earnings),

        "week_earn":          float(week_earn),
        "week_est":           today_earn * 6,
        "month_est":          today_earn * 24,
        "wallet":             w
    })


# ═══════════════════════════════════════════════════════════════
#  LOCATION
# ═══════════════════════════════════════════════════════════════

@app.route("/api/location/update", methods=["POST"])
@require_auth
def update_location():
    """Partner pushes their GPS coordinates."""
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}
    lat  = body.get("latitude")
    lng  = body.get("longitude")
    if lat is None or lng is None:
        return err("latitude and longitude required")
    if not (-90 <= float(lat) <= 90) or not (-180 <= float(lng) <= 180):
        return err("Invalid coordinates")
    execute(
        "UPDATE partners SET latitude=%s, longitude=%s, location_updated_at=CURRENT_TIMESTAMP WHERE id=%s",
        (float(lat), float(lng), pid)
    )
    # Check if any pending referral needs 5-day tracking update
    _check_referral_days(pid)
    return ok(msg="Location updated")


@app.route("/api/location/nearby-orders", methods=["GET"])
@require_auth
def nearby_orders():
    """Return pending orders within ~5 km of partner's last known location."""
    pid = g.partner_id
    partner = query("SELECT latitude, longitude FROM partners WHERE id=%s", (pid,), one=True)
    if not partner or partner["latitude"] is None:
        return err("Location not available — enable location access first", 400)
    plat, plng = partner["latitude"], partner["longitude"]
    # Haversine approximation in SQL using bounding box first, then filter
    orders = [dict(o) for o in query(
        "SELECT * FROM orders WHERE status='pending' AND partner_id IS NULL ORDER BY created_at DESC LIMIT 30"
    )]
    import math
    def haversine(lat1, lon1, lat2, lon2):
        R = 6371
        dlat = math.radians(lat2-lat1); dlon = math.radians(lon2-lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
        return R * 2 * math.asin(math.sqrt(a))
    nearby = []
    for o in orders:
        # Use a rough estimate since we don't store order lat/lng yet
        nearby.append({**o, "estimated_distance_km": round(haversine(plat, plng, 16.5062, 80.6480), 2)})
    return ok({"orders": nearby, "partner_lat": plat, "partner_lng": plng})


# ═══════════════════════════════════════════════════════════════
#  REFERRAL 5-DAY TRACKING
# ═══════════════════════════════════════════════════════════════

def _check_referral_days(partner_id):
    """
    Called on every delivery completion.
    Track how many distinct calendar days the referred partner has worked.
    After 5 days → credit referrer bonus and notify referred partner.
    """
    ref = query(
        "SELECT * FROM referrals WHERE referred_id=%s AND status='pending'",
        (partner_id,), one=True
    )
    if not ref:
        return
    # Count distinct working days (days with at least 1 delivered order)
    days_result = query(
        """SELECT COUNT(DISTINCT DATE(delivered_at)) as days
           FROM orders WHERE partner_id=%s AND status='done'""",
        (partner_id,), one=True
    )
    days_worked = days_result["days"] if days_result else 0
    execute("UPDATE referrals SET days_worked=%s WHERE id=%s", (days_worked, ref["id"]))

    if days_worked >= 5:
        bonus = ref["referrer_bonus"]
        referrer_id = ref["referrer_id"]
        # Credit referrer
        execute(
            "UPDATE wallets SET balance=balance+%s, total_earned=total_earned+%s, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s",
            (bonus, bonus, referrer_id)
        )
        execute(
            "INSERT INTO wallet_transactions (partner_id,label,amount,type,reference) VALUES (%s,%s,%s,%s,%s)",
            (referrer_id, f"Referral bonus – partner {partner_id} worked 5 days", bonus, "referral", f"REF-{ref['id']}")
        )
        execute(
            "UPDATE referrals SET status='paid', qualification_date=CURRENT_TIMESTAMP, paid_at=CURRENT_TIMESTAMP WHERE id=%s",
            (ref["id"],)
        )


@app.route("/api/referrals/status", methods=["GET"])
@require_auth
def referral_status_for_referred():
    """
    Called by a newly joined referred partner to see their progress
    towards unlocking the referrer bonus.
    """
    pid = g.partner_id
    ref = query(
        """SELECT r.*, p.name AS referrer_name
           FROM referrals r
           JOIN partners p ON r.referrer_id = p.id
           WHERE r.referred_id=%s""",
        (pid,), one=True
    )
    if not ref:
        return ok({"referred": False})
    days_worked = ref["days_worked"] or 0
    days_needed = 5
    remaining   = max(0, days_needed - days_worked)
    unlocked    = ref["status"] == "paid"
    msg = (
        f"🎉 You have unlocked your referrer's bonus! {ref['referrer_name']} received ₹{ref['referrer_bonus']:.0f}."
        if unlocked else
        f"⏳ Work {remaining} more day{'s' if remaining != 1 else ''} to unlock ₹{ref['referrer_bonus']:.0f} bonus for {ref['referrer_name']} who referred you!"
    )
    return ok({
        "referred": True,
        "referrer_name": ref["referrer_name"],
        "days_worked": days_worked,
        "days_needed": days_needed,
        "remaining_days": remaining,
        "bonus_amount": ref["referrer_bonus"],
        "unlocked": unlocked,
        "message": msg
    })
def send_otp_twilio(phone, otp):
    """Send OTP via Twilio. Raises exception on failure."""
    if not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        raise Exception("Twilio credentials not configured")
    import urllib.request, urllib.parse, base64 as _b64
    url  = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json"
    data = urllib.parse.urlencode({
        "From": TWILIO_FROM,
        "To":   f"+91{phone}",
        "Body": f"Your LocalMart Hub OTP is {otp}. Valid for 5 minutes. Do not share it with anyone."
    }).encode("utf-8")
    creds = _b64.b64encode(f"{TWILIO_SID}:{TWILIO_TOKEN}".encode()).decode()
    req = urllib.request.Request(url, data=data,
          headers={"Authorization": f"Basic {creds}"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read().decode())
    if result.get("status") in ("failed", "undelivered"):
        raise Exception(result.get("error_message", "SMS failed"))


def send_otp_email(email, otp, phone):
    """Fallback — send OTP to partner's registered email."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "LocalMart Hub – Password Reset OTP"
    msg["From"]    = SMTP_EMAIL
    msg["To"]      = email
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
                background:#f0f4ff;border-radius:16px">
      <div style="font-size:22px;font-weight:800;color:#2563eb">LocalMart Hub</div>
      <div style="font-size:15px;color:#444;margin:16px 0">
        Password reset OTP requested for mobile <b>{phone}</b>:
      </div>
      <div style="font-size:48px;font-weight:900;letter-spacing:12px;
                  color:#2563eb;margin:24px 0;text-align:center">{otp}</div>
      <div style="font-size:13px;color:#888">
        Valid for 5 minutes. Do not share this with anyone.
      </div>
    </div>"""
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(SMTP_EMAIL, SMTP_PASSWORD)
        s.sendmail(SMTP_EMAIL, email, msg.as_string())


@app.route("/api/auth/forgot/send-otp", methods=["POST"])
def forgot_send_otp():
    body  = request.get_json(silent=True) or {}
    phone = (body.get("phone") or "").strip()
    print(f"[DEBUG] forgot OTP requested for phone: '{phone}'")   # ADD THIS
    # check what's actually in DB
    all_phones = query("SELECT phone FROM partners")
    partner = query("SELECT id, name, email FROM partners WHERE phone=%s", (phone,), one=True)
    if not validate_phone(phone):
        return err("Enter a valid 10-digit Indian mobile number")
    partner = query("SELECT id, name, email FROM partners WHERE phone=%s", (phone,), one=True)
    if not partner:
        return err("No account found with this phone number")

    otp = str(random.randint(100000, 999999))
    phone_otp_store[phone] = {
        "otp":        otp,
        "expires_at": time.time() + 300,
        "partner_id": partner["id"]
    }

    # Try Twilio SMS first → fall back to email
    sms_sent   = False
    email_sent = False
    sms_error  = ""

    try:
        send_otp_twilio(phone, otp)
        sms_sent = True
    except Exception as e:
        sms_error = str(e)
        print(f"[Twilio] {sms_error} — trying email fallback")

    if not sms_sent:
        try:
            send_otp_email(partner["email"], otp, phone)
            email_sent = True
        except Exception as e:
            print(f"[Email fallback] {e}")

    if not sms_sent and not email_sent:
        phone_otp_store.pop(phone, None)
        return err("Could not send OTP via SMS or email. Please contact support.")

    delivery = "SMS" if sms_sent else "email"
    dest     = f"your mobile" if sms_sent else partner["email"]
    return ok({
        "name":        partner["name"],
        "sent_via":    delivery,
        "destination": dest
    }, f"OTP sent to {dest}")


@app.route("/api/auth/forgot/verify-otp", methods=["POST"])
def forgot_verify_otp():
    body  = request.get_json(silent=True) or {}
    phone = (body.get("phone") or "").strip()
    otp   = (body.get("otp")   or "").strip()
    entry = phone_otp_store.get(phone)
    if not entry:
        return err("No OTP found. Please request again.")
    if time.time() > entry["expires_at"]:
        phone_otp_store.pop(phone, None)
        return err("OTP expired. Please request a new one.")
    if entry["otp"] != otp:
        return err("Incorrect OTP. Try again.")
    reset_payload = {
        "sub":  entry["partner_id"],
        "type": "password_reset",
        "exp":  datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    reset_token = jwt.encode(reset_payload, SECRET_KEY, algorithm="HS256")
    phone_otp_store.pop(phone, None)
    return ok({"reset_token": reset_token}, "OTP verified successfully")


@app.route("/api/auth/forgot/reset-password", methods=["POST"])
def forgot_reset_password():
    body       = request.get_json(silent=True) or {}
    token      = (body.get("reset_token") or "").strip()
    new_pw     = (body.get("new_password") or "").strip()
    confirm_pw = (body.get("confirm_password") or "").strip()
    if not token or not new_pw:
        return err("reset_token and new_password are required")
    if len(new_pw) < 6:
        return err("Password must be at least 6 characters")
    if new_pw != confirm_pw:
        return err("Passwords do not match")
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        if data.get("type") != "password_reset":
            raise ValueError("Wrong token type")
        pid = data["sub"]
    except jwt.ExpiredSignatureError:
        return err("Reset link expired. Please restart.")
    except Exception:
        return err("Invalid reset token.")
    new_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    execute("UPDATE partners SET password_hash=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (new_hash, pid))
    return ok(msg="Password updated! You can now log in.")

# ═══════════════════════════════════════════════════════════════
#  HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

@app.route("/api/ping")
def ping():
    return jsonify({"status": "ok", "server": "LocalMart Hub API", "time": datetime.now().isoformat()})

#import base64, uuid as _uuid

@app.route("/api/profile/photo", methods=["POST"])
@require_auth
def upload_profile_photo():
    """Accept base64 image and save to static/uploads/."""
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}
    data = body.get("image_data", "")   # base64 data URL: "data:image/jpeg;base64,..."
    if not data or "," not in data:
        return err("No image data provided")
    header, b64 = data.split(",", 1)
    ext = "jpg" if "jpeg" in header else "png"
    uploads_dir = os.path.join(STATIC_DIR, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    filename = f"photo_{pid}.{ext}"
    filepath = os.path.join(uploads_dir, filename)
    with open(filepath, "wb") as f:
        f.write(base64.b64decode(b64))
    url = f"/static/uploads/{filename}"
    execute("UPDATE partners SET profile_photo_url=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s", (url, pid))
    return ok({"url": url}, "Profile photo updated")


@app.route("/api/profile/docimage", methods=["POST"])
@require_auth
def upload_doc_image():
    """Accept base64 image for a document type and save it."""
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}
    data     = body.get("image_data", "")
    doc_type = body.get("doc_type", "doc")   # e.g. aadhaar, pan, licence, rc, insurance, puc
    print(f"[DEBUG] docimage upload: pid={pid}, doc_type={doc_type}, data_len={len(data)}")  # ADD THIS
    if not data or "," not in data:
        print("[DEBUG] No image data!")  # ADD THIS
        return err("No image data provided")
    header, b64 = data.split(",", 1)
    ext = "jpg" if "jpeg" in header else "png"
    uploads_dir = os.path.join(STATIC_DIR, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    filename = f"{doc_type}_{pid}.{ext}"
    filepath = os.path.join(uploads_dir, filename)
    with open(filepath, "wb") as f:
        f.write(base64.b64decode(b64))
    url = f"/static/uploads/{filename}"
    # Store URL in documents table
    col_map = {
        "aadhaar": "aadhaar_img", "pan": "pan_img", "licence": "licence_img",
        "rc": "rc_img", "insurance": "insurance_img", "puc": "puc_img"
    }
    col = col_map.get(doc_type)
    if col:
        exists = query("SELECT id FROM documents WHERE partner_id=%s", (pid,), one=True)
        if exists:
            execute(f"UPDATE documents SET {col}=%s, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s", (url, pid))
        else:
            execute(f"INSERT INTO documents (partner_id, {col}) VALUES (%s,%s)", (pid, url))
    return ok({"url": url}, "Document image uploaded")


# ═══════════════════════════════════════════════════════════════
#  WALLET TOP-UP
# ═══════════════════════════════════════════════════════════════

@app.route("/api/wallet/topup/initiate", methods=["POST"])
@require_auth
def topup_initiate():
    pid    = g.partner_id
    body   = request.get_json(silent=True) or {}
    amount = float(body.get("amount", 0))
    method = (body.get("method") or "upi").lower()
    if amount < 10:
        return err("Minimum top-up amount is ₹10")
    if amount > 50000:
        return err("Maximum single top-up is ₹50,000")
    if method not in ("upi", "card", "netbanking"):
        return err("Invalid payment method")
    ref      = "TUP-" + secrets.token_hex(5).upper()
    upi_vpa  = "7997443637-2@ybl"
    upi_link = f"upi://pay?pa={upi_vpa}&pn=LocalMartHub&am={amount:.2f}&tn=Wallet-{ref}&cu=INR"
    return ok({
        "reference": ref,
        "amount":    amount,
        "method":    method,
        "upi_link":  upi_link,
        "upi_vpa":   upi_vpa
    }, f"Top-up of ₹{amount:.0f} initiated")


@app.route("/api/wallet/topup/confirm", methods=["POST"])
@require_auth
def topup_confirm():
    pid  = g.partner_id
    body = request.get_json(silent=True) or {}
    ref  = (body.get("reference") or "").strip()
    utr  = (body.get("utr") or "").strip()
    amt  = float(body.get("amount", 0))
    meth = (body.get("method") or "UPI").upper()
    if not ref or amt <= 0:
        return err("Reference and amount are required")
    already = query(
        "SELECT id FROM wallet_transactions WHERE partner_id=%s AND reference=%s AND type='topup'",
        (pid, utr or ref), one=True
    )
    if already:
        return err("This top-up has already been confirmed")
    execute(
        "UPDATE wallets SET balance=balance+%s, total_earned=total_earned+%s, updated_at=CURRENT_TIMESTAMP WHERE partner_id=%s",
        (amt, amt, pid)
    )
    execute(
        "INSERT INTO wallet_transactions (partner_id,label,amount,type,reference) VALUES (%s,%s,%s,%s,%s)",
        (pid, f"Wallet Top-up via {meth}", amt, "topup", utr or ref)
    )
    w = row_to_dict(query("SELECT balance FROM wallets WHERE partner_id=%s", (pid,), one=True))
    return ok({"new_balance": w["balance"], "amount_added": amt},
              f"₹{amt:.0f} added to your wallet successfully!")

BLAZRLIT_URL = os.environ.get("BLAZRLIT_URL", "http://192.168.0.143:5000")  # ← change IP

def sync_status_to_blazrlit(order_id, status):
    try:
        _req.post(
            f"{BLAZRLIT_URL}/api/orders/status-update",
            json={"order_id": order_id, "status": status},
            headers={"X-Bridge-Secret": BRIDGE_SECRET},
            timeout=3
        )
    except Exception:
        pass
BRIDGE_SECRET = os.environ.get("BRIDGE_SECRET", "blazrlit-secret-123")



@app.route("/api/orders/push", methods=["POST"])
def push_order_from_blazrlit():
    received = request.headers.get("X-Bridge-Secret", "NOT FOUND")
    expected = BRIDGE_SECRET
    print(f"Received secret: '{received}'")
    print(f"Expected secret: '{expected}'")

    if received != expected:
        return jsonify({"error": "Unauthorized"}), 401

    d = request.get_json(force=True)
    print(f"✅ ORDER RECEIVED: {d.get('id')} | {d.get('item')} | ₹{d.get('amount')}")

    try:
        execute("""
            INSERT INTO orders
              (id, item, category, customer_name, customer_phone,
               pickup_address, delivery_address, order_amount, commission, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending')
            ON CONFLICT (id) DO NOTHING
        """, (
            str(d.get("id")),
            d.get("item", "Order"),
            d.get("category", "General"),
            d.get("customer_name", ""),
            d.get("customer_phone", ""),
            d.get("pickup_address", "Blazrlit Store"),
            d.get("delivery_address", ""),
            float(d.get("amount", 0)),
            float(d.get("commission", 0)),
        ))
        print(f"✅ ORDER SAVED TO DB: {d.get('id')}")
    except Exception as e:
        print(f"❌ DB ERROR: {e}")
        return jsonify({"error": str(e)}), 500

    return jsonify({"ok": True})


@app.route("/api/admin/clear-fake-transactions", methods=["POST"])
def clear_fake_transactions():
    try:
        # Remove ALL bonus transactions except keep none — start fresh
        execute("DELETE FROM wallet_transactions WHERE type = 'bonus'")
        execute("DELETE FROM partner_incentives")
        # Recalculate wallet balance from remaining real transactions
        execute("""
            UPDATE wallets w
            SET balance = COALESCE((
                SELECT SUM(amount) FROM wallet_transactions
                WHERE partner_id = w.partner_id
            ), 0),
            total_earned = COALESCE((
                SELECT SUM(amount) FROM wallet_transactions
                WHERE partner_id = w.partner_id AND amount > 0
            ), 0)
        """)
        return jsonify({"ok": True, "msg": "All bonuses cleared, balance recalculated"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500    

# ─── RUN ──────────────────────────────────────────────────────
if __name__ == "__main__":
    print("📦 Initialising LocalMart Hub database …")
    init_db()
    print(f"✅ Database ready  →  {DATABASE_URL.split('@')[-1]}")   # hide credentials
    
    app.run(debug=True, host="0.0.0.0", port=5001)
