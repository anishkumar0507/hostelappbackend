#!/usr/bin/env node

/**
 * Final Fix - Update remaining null institutionIds directly
 */

import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
  .then(async (conn) => {
    const db = mongoose.connection.db;

    try {
      console.log('🔧 Final institutionId fix...\n');

      const institutionId = new ObjectId('698c11f0bb98908d91cd204e');

      // Find all records with null/missing institutionId
      const nullRecords = await db.collection('leaves')
        .find({ $or: [
          { institutionId: null },
          { institutionId: { $exists: false } }
        ]})
        .toArray();

      console.log(`Found ${nullRecords.length} records with null institutionId\n`);

      // Update all of them
      const result = await db.collection('leaves').updateMany(
        { $or: [
          { institutionId: null },
          { institutionId: { $exists: false } }
        ]},
        { $set: { institutionId } }
      );

      console.log(`✅ Updated ${result.modifiedCount} records`);

      // Verify
      const finalCheck = await db.collection('leaves').countDocuments({ 
        institutionId: { $ne: null, $exists: true } 
      });
      const total = await db.collection('leaves').countDocuments();

      console.log(`\n✅ Final check:`);
      console.log(`   Total records: ${total}`);
      console.log(`   Records with institutionId: ${finalCheck}`);
      console.log(`   Missing: ${total - finalCheck}`);

      if (finalCheck === total) {
        console.log('\n🎉 ALL RECORDS FIXED!');
        
        // Show what wardens see
        const leaves = await db.collection('leaves').find({}).toArray();
        console.log(`\n📋 Outing records by status:`);
        const byStatus = {};
        leaves.forEach(l => {
          byStatus[l.status] = (byStatus[l.status] || 0) + 1;
        });
        Object.entries(byStatus).forEach(([status, count]) => {
          console.log(`   ├─ ${status}: ${count}`);
        });
      }

      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
