import { loadPlatinumConfig } from '../config/platinum-config';
import fs from 'fs';
import path from 'path';

function setupDeployment(): void {
  const config = loadPlatinumConfig();
  const { supervisor, serviceName, maxRestarts } = config.deployment;

  console.log(`Setting up deployment for: ${serviceName}`);
  console.log(`Supervisor: ${supervisor}`);
  console.log(`Agent mode: ${config.agentMode}`);
  console.log();

  if (supervisor === 'systemd') {
    const unitFile = path.resolve(__dirname, 'ai-employee-cloud.service');
    console.log('=== systemd Setup Instructions ===');
    console.log();
    console.log(`1. Copy the unit file:`);
    console.log(`   sudo cp ${unitFile} /etc/systemd/system/${serviceName}.service`);
    console.log();
    console.log(`2. Edit paths in the unit file if needed:`);
    console.log(`   sudo nano /etc/systemd/system/${serviceName}.service`);
    console.log();
    console.log(`3. Reload systemd and enable the service:`);
    console.log(`   sudo systemctl daemon-reload`);
    console.log(`   sudo systemctl enable ${serviceName}`);
    console.log(`   sudo systemctl start ${serviceName}`);
    console.log();
    console.log(`4. Check status:`);
    console.log(`   sudo systemctl status ${serviceName}`);
    console.log(`   sudo journalctl -u ${serviceName} -f`);
  } else {
    const ecosystemFile = path.resolve(__dirname, 'ecosystem.config.js');
    console.log('=== PM2 Setup Instructions ===');
    console.log();
    console.log(`1. Install PM2 globally if not already:`);
    console.log(`   npm install -g pm2`);
    console.log();
    console.log(`2. Start the application:`);
    console.log(`   pm2 start ${ecosystemFile}`);
    console.log();
    console.log(`3. Save PM2 process list and configure startup:`);
    console.log(`   pm2 save`);
    console.log(`   pm2 startup`);
    console.log();
    console.log(`4. Check status:`);
    console.log(`   pm2 status`);
    console.log(`   pm2 logs ${serviceName}`);
  }

  console.log();
  console.log(`Max restarts: ${maxRestarts}`);
  console.log('Setup instructions printed. Follow the steps above to complete deployment.');
}

// Run when executed directly
setupDeployment();
