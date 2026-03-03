import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const fixMenuVoteIndex = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const MenuVote = mongoose.connection.collection('menuvotes');

    // Get existing indexes
    console.log('\n📋 Current indexes:');
    const indexes = await MenuVote.indexes();
    indexes.forEach((idx) => {
      console.log('  -', idx.name, ':', JSON.stringify(idx.key));
    });

    // Drop old index if it exists
    try {
      console.log('\n🗑️  Dropping old index: studentId_1_mealType_1');
      await MenuVote.dropIndex('studentId_1_mealType_1');
      console.log('✅ Old index dropped');
    } catch (error) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('ℹ️  Old index not found (already dropped or doesn\'t exist)');
      } else {
        throw error;
      }
    }

    // Create new index
    console.log('\n🔨 Creating new index: menuId_1_studentId_1_mealType_1');
    await MenuVote.createIndex(
      { menuId: 1, studentId: 1, mealType: 1 },
      { unique: true, name: 'menuId_1_studentId_1_mealType_1' }
    );
    console.log('✅ New index created');

    // Display final indexes
    console.log('\n📋 Final indexes:');
    const finalIndexes = await MenuVote.indexes();
    finalIndexes.forEach((idx) => {
      console.log('  -', idx.name, ':', JSON.stringify(idx.key));
    });

    console.log('\n✅ MenuVote index migration complete!');
    console.log('\nℹ️  One student can now vote once per menu per meal type.');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fixing index:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

fixMenuVoteIndex();
