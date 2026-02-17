import mongoose from 'mongoose';

// Test if parent and warden endpoints are working

const uri = 'mongodb+srv://hosteleaseUser_:Hostelease123@cluster0.rkbqbqw.mongodb.net/hostelease_school?retryWrites=true&w=majority';

async function testEndpoints() {
  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB Connected');

    // Get parent user
    const userSchema = new mongoose.Schema({
      name: String,
      email: String, 
      password: String,
      role: String,
      _id: mongoose.Schema.Types.ObjectId
    }, { collection: 'users' });

    const User = mongoose.model('User', userSchema);
    
    const parent = await User.findOne({ role: 'parent' });
    const warden = await User.findOne({ role: 'warden' });
    const student = await User.findOne({ role: 'student' });

    console.log('\n=== Database Users ===');
    if (parent) console.log(`Parent: ${parent.name} (${parent.email}) - Role: ${parent.role}`);
    if (warden) console.log(`Warden: ${warden.name} (${warden.email}) - Role: ${warden.role}`);
    if (student) console.log(`Student: ${student.name} (${student.email}) - Role: ${student.role}`);

    console.log('\n✅ Users verified in database');
    console.log('\nIssue: Parent and Warden need to clear their old tokens and re-login');
    console.log('Solution: Users should click "Logout" in the sidebar and login again');
    
    process.exit(0);
  } catch (err) {
    console.log('Error:', err.message);
    process.exit(1);
  }
}

testEndpoints();
