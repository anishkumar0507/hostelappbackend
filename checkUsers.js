import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: String,
  email: String, 
  password: String,
  role: String
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);
const uri = 'mongodb+srv://hosteleaseUser_:Hostelease123@cluster0.rkbqbqw.mongodb.net/hostelease_school?retryWrites=true&w=majority';

mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).then(async () => {
  const users = await User.find({}, 'name email role');
  console.log('\n=== ALL USERS IN DATABASE ===\n');
  users.forEach(user => {
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
    console.log('---');
  });
  process.exit(0);
}).catch(err => {
  console.log('Error:', err.message);
  process.exit(1);
});
