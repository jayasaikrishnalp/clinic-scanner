CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinic_id TEXT,
    patient_name TEXT NOT NULL,
    age_sex TEXT,
    phone_number TEXT,
    location TEXT,
    visit_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);