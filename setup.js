const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Create necessary directories
const directories = ['public', 'uploads'];
directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        console.log(`Created directory: ${dir}`);
    }
});

// Move existing files to public directory
const filesToMove = ['index.html', 'styles.css', 'app.js'];
filesToMove.forEach(file => {
    if (fs.existsSync(file)) {
        fs.renameSync(file, path.join('public', file));
        console.log(`Moved ${file} to public directory`);
    }
});

// Initialize npm project and install dependencies
try {
    console.log('Initializing npm project...');
    execSync('npm init -y');
    
    console.log('Installing dependencies...');
    execSync('npm install express multer @anthropic-ai/sdk sqlite3 sqlite better-sqlite3');
    
    // Create database schema
    const dbSchema = `
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;
    
    fs.writeFileSync('schema.sql', dbSchema);
    console.log('Created database schema');
    
    console.log('Project setup completed successfully!');
} catch (error) {
    console.error('Error during setup:', error.message);
} 