const express = require('express');
const multer = require('multer');
const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Backup directory
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

// Backup database every 24 hours
function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `contacts-${timestamp}.db`);
    
    try {
        // Create a backup
        fs.copyFileSync(path.join(__dirname, 'contacts.db'), backupPath);
        
        // Keep only last 7 backups
        const files = fs.readdirSync(BACKUP_DIR);
        if (files.length > 7) {
            const oldestFile = files.sort()[0];
            fs.unlinkSync(path.join(BACKUP_DIR, oldestFile));
        }
        
        console.log(`Database backed up to ${backupPath}`);
    } catch (error) {
        console.error('Backup failed:', error);
    }
}

// Schedule backup
setInterval(backupDatabase, 24 * 60 * 60 * 1000); // Every 24 hours
// Initial backup
backupDatabase();

const app = express();
const upload = multer({ dest: 'uploads/' });

// Initialize database
const db = new Database(path.join(__dirname, 'contacts.db'));

// Create tables if they don't exist (instead of dropping and recreating)
db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinic_id TEXT,
        patient_name TEXT,
        age_sex TEXT,
        phone_number TEXT,
        location TEXT,
        visit_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

app.use(express.static('public'));
app.use(express.json());

app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString('base64');

        console.log('Sending image to Claude for analysis...');
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-latest',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'This is my medical clinic register and want to digitize it. First, extract the date from the top of the register (format: DD/MM/YY). Then extract the following information in JSON format: clinic_id, patient name, age/sex, phone number, and location. Also calculate the total number of patients and total OP amount. Return the data in this format: {"visit_date": "DD/MM/YY", "patients": [{"clinic_id": "123", "name": "John Doe", "age_sex": "45/M", "phone": "1234567890", "location": "City"}, ...], "summary": {"total_patients": 25, "total_amount": 5000}}. Extract all data from the image, if any data is missing, please leave it blank, but you need to return the json data. should contain only json data'
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: base64Image
                        }
                    }
                ]
            }]
        });

        console.log('Claude response:', response.content[0].text);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        // Send the analysis back to the client
        res.json({ contacts: response.content[0].text });

    } catch (error) {
        console.error('Detailed error:', error);
        console.error('Error analyzing image:', error);
        res.status(500).json({ error: 'Failed to analyze image' });
    }
});

// API endpoints for contact management
app.post('/api/contacts', (req, res) => {
    try {
        const { clinic_id, patient_name, age_sex, phone_number, location, visit_date } = req.body;
        // Validate required fields
        if (!clinic_id || !patient_name) {
            return res.status(400).json({ error: 'Clinic ID and Patient Name are required' });
        }

        const stmt = db.prepare(
            'INSERT INTO contacts (clinic_id, patient_name, age_sex, phone_number, location, visit_date) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const result = stmt.run(clinic_id, patient_name, age_sex, phone_number, location, visit_date);
        res.json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/contacts', (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const searchField = req.query.field || 'all';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const sortBy = req.query.sortBy || 'created_at';
        const sortOrder = req.query.sortOrder || 'DESC';
        
        // Validate sort field to prevent SQL injection
        const allowedSortFields = ['clinic_id', 'patient_name', 'age_sex', 'phone_number', 'location', 'visit_date', 'created_at'];
        if (!allowedSortFields.includes(sortBy)) {
            return res.status(400).json({ error: 'Invalid sort field' });
        }
        
        let query = 'SELECT * FROM contacts';
        let params = [];
        
        if (searchTerm) {
            if (searchField === 'all') {
                query += ` WHERE clinic_id LIKE ? OR patient_name LIKE ? OR phone_number LIKE ? OR location LIKE ?`;
                params = Array(4).fill(`%${searchTerm}%`);
            } else {
                query += ` WHERE ${searchField} LIKE ?`;
                params = [`%${searchTerm}%`];
            }
        }
        
        query += ` ORDER BY ${sortBy} ${sortOrder}`;
        query += ` LIMIT ? OFFSET ?`;
        params.push(limit, (page - 1) * limit);
        
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM contacts';
        if (searchTerm) {
            if (searchField === 'all') {
                countQuery += ` WHERE clinic_id LIKE ? OR patient_name LIKE ? OR phone_number LIKE ? OR location LIKE ?`;
            } else {
                countQuery += ` WHERE ${searchField} LIKE ?`;
            }
        }
        const totalCount = db.prepare(countQuery).get(...params.slice(0, -2)).total;
        
        const contacts = db.prepare(query).all(...params);
        console.log('Found contacts:', contacts.length);
        res.json({
            contacts,
            pagination: {
                total: totalCount,
                pages: Math.ceil(totalCount / limit),
                currentPage: page
            }
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/contacts/:id', (req, res) => {
    try {
        const { clinic_id, patient_name, age_sex, phone_number, location, visit_date } = req.body;
        const stmt = db.prepare(
            'UPDATE contacts SET clinic_id = ?, patient_name = ?, age_sex = ?, phone_number = ?, location = ?, visit_date = ? WHERE id = ?'
        );
        stmt.run(clinic_id, patient_name, age_sex, phone_number, location, visit_date, req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/contacts/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM contacts WHERE id = ?');
        stmt.run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add endpoint to get a single record
app.get('/api/contacts/:id', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?');
        const contact = stmt.get(req.params.id);
        if (!contact) {
            return res.status(404).json({ error: 'Record not found' });
        }
        res.json(contact);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 