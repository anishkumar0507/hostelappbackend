import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const uri = 'mongodb+srv://hosteleaseUser_:Hostelease123@cluster0.rkbqbqw.mongodb.net/hostelease_school?retryWrites=true&w=majority';

async function testTokens() {
  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB Connected\n');

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

    console.log('=== GENERATED TEST TOKENS ===\n');

    // Generate tokens like the backend does
    const generateToken = (userId, role, name) => {
      return jwt.sign(
        { userId, role, name, isTempPassword: false },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
    };

    if (parent) {
      const parentToken = generateToken(parent._id, parent.role, parent.name);
      console.log(`Parent Token (${parent.name}):`);
      console.log(parentToken);
      console.log('');

      // Decode to verify
      const decoded = jwt.verify(parentToken, process.env.JWT_SECRET);
      console.log('Decoded:', { userId: decoded.userId, role: decoded.role, name: decoded.name });
      console.log('');
    }

    if (warden) {
      const wardenToken = generateToken(warden._id, warden.role, warden.name);
      console.log(`Warden Token (${warden.name}):`);
      console.log(wardenToken);
      console.log('');

      // Decode to verify
      const decoded = jwt.verify(wardenToken, process.env.JWT_SECRET);
      console.log('Decoded:', { userId: decoded.userId, role: decoded.role, name: decoded.name });
      console.log('');
    }

    console.log('✅ Token generation verified');
    console.log('\nTo fix 403 errors:');
    console.log('1. Open browser DevTools (F12)');
    console.log('2. Go to Application/Storage > LocalStorage');
    console.log('3. Find "user_token" key and delete it');
    console.log('4. Refresh page and login again');
    
    process.exit(0);
  } catch (err) {
    console.log('Error:', err.message);
    process.exit(1);
  }
}

testTokens();
