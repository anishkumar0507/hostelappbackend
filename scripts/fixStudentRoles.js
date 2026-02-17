/**
 * Migration script to fix missing student roles
 * Run with: node scripts/fixStudentRoles.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import User from '../src/models/User.model.js';
import Student from '../src/models/Student.model.js';
import Parent from '../src/models/Parent.model.js';

async function fixRoles() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n📊 Analyzing users...');

    // Fix Student users
    console.log('\n🎓 Fixing student roles...');
    const students = await Student.find({}).select('userId');
    const studentUserIds = students.map(s => s.userId);
    
    const studentUpdateResult = await User.updateMany(
      { _id: { $in: studentUserIds }, role: { $ne: 'student' } },
      { $set: { role: 'student' } }
    );
    console.log(`✅ Updated ${studentUpdateResult.modifiedCount} student users`);

    // Fix Parent users
    console.log('\n👨‍👩‍👧 Fixing parent roles...');
    const parents = await Parent.find({}).select('userId');
    const parentUserIds = parents.map(p => p.userId);
    
    const parentUpdateResult = await User.updateMany(
      { _id: { $in: parentUserIds }, role: { $ne: 'parent' } },
      { $set: { role: 'parent' } }
    );
    console.log(`✅ Updated ${parentUpdateResult.modifiedCount} parent users`);

    // Check for users without roles
    console.log('\n🔍 Checking for users without roles...');
    const usersWithoutRole = await User.find({ role: { $exists: false } });
    if (usersWithoutRole.length > 0) {
      console.log(`⚠️  Found ${usersWithoutRole.length} users without roles`);
      usersWithoutRole.forEach(u => {
        console.log(`   - ${u.name} (${u.email}): ID ${u._id}`);
      });
    } else {
      console.log('✅ All users have roles assigned');
    }

    // Summary
    console.log('\n📈 Summary:');
    const userStats = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    userStats.forEach(stat => {
      console.log(`   ${stat._id || 'unknown'}: ${stat.count} users`);
    });

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

fixRoles();
