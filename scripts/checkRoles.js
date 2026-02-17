/**
 * Check user roles in database
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import User from '../src/models/User.model.js';

async function checkRoles() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const users = await User.find({}, 'email name role').sort({ createdAt: -1 });
    
    console.log('=== All Users in Database ===\n');
    users.forEach(u => {
      const roleStatus = u.role ? '✅' : '❌';
      console.log(`${roleStatus} ${u.name.padEnd(20)} (${u.email.padEnd(30)}) → Role: ${u.role || 'NOT SET'}`);
    });

    console.log('\n=== Role Summary ===');
    const roleCount = {};
    users.forEach(u => {
      const role = u.role || 'NOT SET';
      roleCount[role] = (roleCount[role] || 0) + 1;
    });

    Object.entries(roleCount).forEach(([role, count]) => {
      console.log(`${role}: ${count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkRoles();
