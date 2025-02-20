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

    # Install dependencies
    npm install

    # Start/Restart the application using PM2
    pm2 restart clinic-scanner || pm2 start server.js --name clinic-scanner
ENDSSH

echo "Deployment complete!" 