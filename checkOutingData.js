#!/usr/bin/env node

/**
 * Quick Database Query Script
 * Run this to check actual outing data in MongoDB
 * Usage: node checkOutingData.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error('❌ MONGO_URI not found in .env');
  process.exit(1);
}

console.log('🔍 Connecting to MongoDB...');
console.log(`📍 Database: ${mongoUri.split('/').pop().split('?')[0]}`);

mongoose.connect(mongoUri)
  .then(async (conn) => {
    console.log('✅ Connected to MongoDB\n');

    // Get collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📦 Available collections:', collections.map(c => c.name).join(', '));
    console.log('');

    const db = mongoose.connection.db;

    // Check leaves collection
    console.log('═══════════════════════════════════════');
    console.log('🏫 LEAVES (OUTING REQUESTS) COLLECTION');
    console.log('═══════════════════════════════════════\n');

    const leavesCount = await db.collection('leaves').countDocuments();
    console.log(`📊 Total outing records: ${leavesCount}`);

    if (leavesCount > 0) {
      // Group by status
      const statusCounts = await db.collection('leaves').aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).toArray();

      console.log('\n📈 Records by Status:');
      statusCounts.forEach(item => {
        console.log(`  ├─ ${item._id}: ${item.count}`);
      });

      // Get institution counts
      const institutionCounts = await db.collection('leaves').aggregate([
        { $group: { _id: '$institutionId', count: { $sum: 1 } } }
      ]).toArray();

      console.log('\n🏛️  Records by Institution:');
      institutionCounts.forEach(item => {
        console.log(`  ├─ ${item._id}: ${item.count}`);
      });

      // Show latest 3 records
      console.log('\n📋 Latest 3 Outing Records:');
      const latest = await db.collection('leaves')
        .find({})
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      latest.forEach((doc, idx) => {
        console.log(`\n  Record ${idx + 1}:`);
        console.log(`    ID: ${doc._id}`);
        console.log(`    Student: ${doc.studentId}`);
        console.log(`    Status: ${doc.status}`);
        console.log(`    Out Date: ${doc.outDate?.toLocaleDateString('en-IN')}`);
        console.log(`    In Date: ${doc.inDate?.toLocaleDateString('en-IN')}`);
        console.log(`    Reason: ${doc.reason}`);
        console.log(`    Created: ${doc.createdAt?.toLocaleString('en-IN')}`);
        console.log(`    Institution: ${doc.institutionId}`);
      });
    } else {
      console.log('\n⚠️  NO OUTING RECORDS FOUND IN DATABASE');
      console.log('\n💡 Next steps:');
      console.log('  1. Student must submit outing request');
      console.log('  2. Parent must approve the request');
      console.log('  3. Then warden can see & manage it');
    }

    console.log('\n═══════════════════════════════════════\n');

    // Check students collection too
    const studentsCount = await db.collection('students').countDocuments();
    console.log(`📚 Total students: ${studentsCount}`);

    // Check users collection
    const usersCount = await db.collection('users').countDocuments();
    console.log(`👥 Total users: ${usersCount}`);

    // Show warden users
    const wardens = await db.collection('users').find({ role: 'warden' }).toArray();
    console.log(`🚨 Total wardens: ${wardens.length}`);
    if (wardens.length > 0) {
      console.log('\n🔑 Warden Details:');
      wardens.slice(0, 3).forEach(w => {
        console.log(`  ├─ ${w.name} (${w.email}) - Institution: ${w.institutionId}`);
      });
    }

    console.log('\n✅ Query complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
