#!/bin/bash

# Zip the application files
zip -r deploy.zip . -x "node_modules/*" "uploads/*" "contacts.db" "*.pem" "*.log"

# Copy to EC2
scp -i your-key.pem deploy.zip ubuntu@your-ec2-ip:/var/www/clinic-scanner/

# SSH into EC2 and deploy
ssh -i your-key.pem ubuntu@your-ec2-ip << 'ENDSSH'
cd /var/www/clinic-scanner
unzip -o deploy.zip
npm install
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
ENDSSH 