#!/bin/bash

# Replace these with your EC2 details
EC2_USER="ubuntu"
EC2_IP="your-ec2-ip"
EC2_KEY="path/to/your-key.pem"

# Create deployment package
echo "Creating deployment package..."
zip -r deploy.zip . -x "node_modules/*" "uploads/*" "contacts.db" "*.pem" "*.log"

# Copy files to EC2
echo "Copying files to EC2..."
scp -i $EC2_KEY deploy.zip $EC2_USER@$EC2_IP:~/ 

# Deploy on EC2
echo "Deploying on EC2..."
ssh -i $EC2_KEY $EC2_USER@$EC2_IP << 'ENDSSH'
    # Create app directory if it doesn't exist
    mkdir -p ~/clinic-scanner

    # Unzip deployment package
    mv deploy.zip ~/clinic-scanner/
    cd ~/clinic-scanner
    unzip -o deploy.zip

    # Install build essentials if not already installed
    sudo apt-get update
    sudo apt-get install -y python3 make g++ build-essential sqlite3 libsqlite3-dev

    # Install and setup nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install and use specific Node.js version
    nvm install 18.18.0
    nvm use 18.18.0

    # Install dependencies
    rm -rf node_modules
    rm -f package-lock.json
    npm install

    # Rebuild better-sqlite3
    npm install better-sqlite3 --build-from-source

    # Start/Restart the application using PM2
    npm install -g pm2
    pm2 restart clinic-scanner || pm2 start server.js --name clinic-scanner
ENDSSH

echo "Deployment complete!" 