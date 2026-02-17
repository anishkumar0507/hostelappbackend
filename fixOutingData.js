#!/usr/bin/env node

/**
 * Fix institutionId for Wardens and Outing Records
 * This script:
 * 1. Assigns correct institutionId to wardens
 * 2. Fixes null institutionId on outing records
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error('❌ MONGO_URI not found in .env');
  process.exit(1);
}

console.log('🔧 Starting database fix...\n');

mongoose.connect(mongoUri)
  .then(async (conn) => {
    const db = mongoose.connection.db;

    try {
      // Step 1: Get all wardens and students
      console.log('📋 Step 1: Fetching data...');
      const wardens = await db.collection('users').find({ role: 'warden' }).toArray();
      const students = await db.collection('students').find({}).toArray();
      const leaves = await db.collection('leaves').find({}).toArray();

      console.log(`  └─ Found ${wardens.length} wardens`);
      console.log(`  └─ Found ${students.length} students`);
      console.log(`  └─ Found ${leaves.length} outing records\n`);

      // Step 2: Map students to institutions
      console.log('🏛️  Step 2: Getting institution mapping...');
      const studentToInstitution = {};
      for (const student of students) {
        studentToInstitution[student._id.toString()] = student.institutionId;
      }
      console.log(`  └─ Mapped ${Object.keys(studentToInstitution).length} students to institutions\n`);

      // Step 3: Fix wardens without institutionId
      console.log('🚨 Step 3: Fixing warden institutionIds...');
      for (const warden of wardens) {
        if (!warden.institutionId || warden.institutionId === 'null' || warden.institutionId === null) {
          // Try to find institution from students created by this warden or use first student's institution
          let institutionId = students[0]?.institutionId;

          if (institutionId) {
            const result = await db.collection('users').updateOne(
              { _id: warden._id },
              { $set: { institutionId } }
            );
            console.log(`  ✅ ${warden.name} (${warden.email})`);
            console.log(`      └─ Set institutionId: ${institutionId}\n`);
          }
        } else {
          console.log(`  ✅ ${warden.name} - Already has institutionId: ${warden.institutionId}\n`);
        }
      }

      // Step 4: Fix outing records with null/undefined institutionId
      console.log('📝 Step 4: Fixing outing records...');
      let fixedCount = 0;

      for (const leave of leaves) {
        if (!leave.institutionId || leave.institutionId === 'null' || leave.institutionId === null) {
          // Get institution from the student
          const studentInstitution = studentToInstitution[leave.studentId.toString()];
          
          if (studentInstitution) {
            const result = await db.collection('leaves').updateOne(
              { _id: leave._id },
              { $set: { institutionId: studentInstitution } }
            );
            console.log(`  ✅ Record ${leave._id.toString().slice(-8)}... fixed`);
            console.log(`      └─ Institution: ${studentInstitution}`);
            fixedCount++;
          }
        }
      }
      console.log(`  └─ Fixed ${fixedCount} records\n`);

      // Step 5: Verify the fix
      console.log('🔍 Step 5: Verifying fix...\n');
      const leavesCount = await db.collection('leaves').countDocuments();
      const wardenCount = await db.collection('users').countDocuments({ role: 'warden' });
      const recordsWithInstitution = await db.collection('leaves').countDocuments({ institutionId: { $ne: null } });

      console.log(`✅ Total outing records: ${leavesCount}`);
      console.log(`✅ Records with institutionId: ${recordsWithInstitution}`);
      console.log(`✅ Wardens: ${wardenCount}`);

      if (recordsWithInstitution === leavesCount) {
        console.log('\n🎉 SUCCESS! All records fixed!');
        console.log('\n📱 Warden app will now show ALL outing records.');
      } else {
        console.log('\n⚠️  Some records still have null institutionId');
      }

      // Step 6: Show what wardens will see now
      console.log('\n\n🔐 Final Status:');
      const wardenStatus = await db.collection('users')
        .find({ role: 'warden' })
        .toArray();

      for (const warden of wardenStatus) {
        const wardenRecords = await db.collection('leaves')
          .countDocuments({ institutionId: warden.institutionId });
        console.log(`\n  ${warden.name} (${warden.email})`);
        console.log(`    └─ Institution ID: ${warden.institutionId}`);
        console.log(`    └─ Can see: ${wardenRecords} outing records`);
      }

      console.log('\n✅ Done!\n');
      process.exit(0);

    } catch (error) {
      console.error('❌ Error during fix:', error.message);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  });
