#!/usr/bin/env node

/**
 * Deep Database Fix - Creates institution structure if missing
 * This script ensures:
 * 1. Institution exists and is properly linked
 * 2. Students have institutionId
 * 3. Wardens belong to institutions
 * 4. Outing records linked to institutions
 */

import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error('❌ MONGO_URI not found in .env');
  process.exit(1);
}

console.log('🔧 Starting DEEP database fix...\n');

mongoose.connect(mongoUri)
  .then(async (conn) => {
    const db = mongoose.connection.db;

    try {
      // Step 1: List what we have
      console.log('📊 Step 1: Current state...');
      const institutions = await db.collection('institutions').find({}).toArray();
      const wardens = await db.collection('users').find({ role: 'warden' }).toArray();
      const students = await db.collection('students').find({}).toArray();
      const leaves = await db.collection('leaves').find({}).toArray();

      console.log(`  Institutions: ${institutions.length}`);
      institutions.forEach(inst => {
        console.log(`    ├─ ${inst._id} - ${inst.name || 'Unnamed'}`);
      });

      console.log(`\n  Wardens: ${wardens.length}`);
      wardens.forEach(w => {
        console.log(`    ├─ ${w.name} (${w.email}) - Institution: ${w.institutionId || 'NONE'}`);
      });

      console.log(`\n  Students: ${students.length}`);
      students.forEach(s => {
        console.log(`    ├─ ID: ${s._id} - Institution: ${s.institutionId || 'NONE'}`);
      });

      // Step 2: Create or get main institution
      console.log('\n\n🏛️  Step 2: Setting up institution...');
      
      let mainInstitution = institutions[0];
      if (!mainInstitution) {
        console.log('  ⚠️  No institutions found. Creating default...');
        const result = await db.collection('institutions').insertOne({
          name: 'Test Institution',
          address: 'Test Address',
          contact: '9999999999',
          createdAt: new Date(),
        });
        mainInstitution = { _id: result.insertedId, name: 'Test Institution' };
        console.log(`  ✅ Created: ${mainInstitution._id}`);
      } else {
        console.log(`  ✅ Using: ${mainInstitution._id} (${mainInstitution.name})`);
      }

      const institutionId = mainInstitution._id;

      // Step 3: Update students to have institutionId
      console.log('\n\n📚 Step 3: Linking students to institution...');
      let studentUpdateCount = 0;
      for (const student of students) {
        if (!student.institutionId) {
          await db.collection('students').updateOne(
            { _id: student._id },
            { $set: { institutionId } }
          );
          console.log(`  ✅ Student ${student._id} - Set institution`);
          studentUpdateCount++;
        }
      }
      console.log(`  └─ Updated: ${studentUpdateCount} students`);

      // Step 4: Update wardens to have institutionId
      console.log('\n\n🚨 Step 4: Linking wardens to institution...');
      let wardenUpdateCount = 0;
      for (const warden of wardens) {
        if (!warden.institutionId) {
          await db.collection('users').updateOne(
            { _id: warden._id },
            { $set: { institutionId } }
          );
          console.log(`  ✅ ${warden.name} - Set institution`);
          wardenUpdateCount++;
        }
      }
      console.log(`  └─ Updated: ${wardenUpdateCount} wardens`);

      // Step 5: Update outing records to have institutionId
      console.log('\n\n📋 Step 5: Linking outing records to institution...');
      
      // First, get the student-institution mapping
      const updatedStudents = await db.collection('students').find({}).toArray();
      const studentToInst = {};
      for (const student of updatedStudents) {
        studentToInst[student._id.toString()] = student.institutionId;
      }

      let recordUpdateCount = 0;
      for (const leave of leaves) {
        const studentInst = studentToInst[leave.studentId.toString()];
        if (!leave.institutionId && studentInst) {
          await db.collection('leaves').updateOne(
            { _id: leave._id },
            { $set: { institutionId: studentInst } }
          );
          recordUpdateCount++;
        }
      }
      console.log(`  ✅ Updated: ${recordUpdateCount} records`);

      // Step 6: Final verification
      console.log('\n\n🔍 Step 6: Final verification...\n');
      
      const finalWardens = await db.collection('users').find({ role: 'warden' }).toArray();
      const finalLeaves = await db.collection('leaves').find({}).toArray();
      const leavesWithInst = finalLeaves.filter(l => l.institutionId);

      console.log('✅ FINAL STATUS:');
      console.log(`   Total wardens: ${finalWardens.length}`);
      console.log(`   Wardens with institution: ${finalWardens.filter(w => w.institutionId).length}`);
      console.log(`   Total outing records: ${finalLeaves.length}`);
      console.log(`   Records with institution: ${leavesWithInst.length}`);

      // What each warden will see
      console.log('\n\n📱 WARDEN VIEW (After Fix):');
      for (const warden of finalWardens) {
        const visibleRecords = finalLeaves.filter(l => 
          l.institutionId && l.institutionId.toString() === warden.institutionId.toString()
        );
        console.log(`\n  ${warden.name}`);
        console.log(`    └─ Institution: ${warden.institutionId}`);
        console.log(`    └─ Can see: ${visibleRecords.length} records`);
        if (visibleRecords.length > 0) {
          visibleRecords.slice(0, 2).forEach(rec => {
            console.log(`       ├─ ${rec.reason} (${rec.status})`);
          });
        }
      }

      if (leavesWithInst.length === finalLeaves.length) {
        console.log('\n\n🎉 ✅ ALL FIXED! Data is ready to display.');
      } else {
        console.log('\n\n⚠️  Some records still missing institution');
      }

      console.log('\n');
      process.exit(0);

    } catch (error) {
      console.error('❌ Error:', error.message);
      console.error(error);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  });
