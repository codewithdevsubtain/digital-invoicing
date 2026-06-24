import fs from 'fs';
import path from 'path';
import os from 'os';

// Determine the AppData Roaming directory for HVAC ERP on Windows
// For completeness, we also support macOS and Linux path resolution.
let userDataPath;
if (process.platform === 'win32') {
  userDataPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'hvac-erp');
} else if (process.platform === 'darwin') {
  userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'hvac-erp');
} else {
  userDataPath = path.join(os.homedir(), '.config', 'hvac-erp');
}

const dbDir = path.join(userDataPath, 'database');
const dbFile = path.join(dbDir, 'hvac-erp.db');
const walFile = path.join(dbDir, 'hvac-erp.db-wal');
const shmFile = path.join(dbDir, 'hvac-erp.db-shm');

console.log(`Target database directory: ${dbDir}`);
console.log('Starting HVAC ERP database reset...');

let deletedCount = 0;

[dbFile, walFile, shmFile].forEach(file => {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`Successfully deleted: ${path.basename(file)}`);
      deletedCount++;
    } catch (err) {
      console.error(`Error deleting ${path.basename(file)}:`, err.message);
      console.error('Please make sure the HVAC ERP desktop application is closed before running this command.');
    }
  } else {
    console.log(`File not found (already clean): ${path.basename(file)}`);
  }
});

if (deletedCount > 0) {
  console.log('\nDatabase reset completed successfully! A fresh database will be auto-generated and seeded upon the next application launch.');
} else {
  console.log('\nDatabase is already clean. No files were deleted.');
}
