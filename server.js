const express = require('express');
const multer = require('multer');
const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Initialize database
const db = new Database(path.join(__dirname, 'contacts.db'));
// Force recreation of tables
db.exec('DROP TABLE IF EXISTS contacts');
db.exec(fs.readFileSync('schema.sql', 'utf8'));

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
        console.log('Saving contact:', { clinic_id, patient_name, age_sex, phone_number, location });
        const stmt = db.prepare(
            'INSERT INTO contacts (clinic_id, patient_name, age_sex, phone_number, location, visit_date) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const result = stmt.run(clinic_id, patient_name, age_sex, phone_number, location, visit_date);
        console.log('Saved with ID:', result.lastInsertRowid);
        res.json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error saving contact:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/contacts', (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const searchField = req.query.field || 'all';
        
        console.log('Fetching contacts. Search:', searchTerm, 'Field:', searchField);
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
        
        query += ' ORDER BY created_at DESC';
        
        const contacts = db.prepare(query).all(...params);
        console.log('Found contacts:', contacts.length);
        res.json(contacts);
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