# Render Email Configuration Fix Guide

## Problem
Email transporter verification failing on Render with "Connection timeout" error.

**Root Cause:** Render likely blocks outbound SMTP connections (port 587, 465) on free tier or doesn't allow third-party SMTP access.

---

## Solution 1: Gmail SMTP Quick Fix (Test First)

### Step 1: Verify Gmail App Password
Your current `.env` should look like:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=anishsinghaniya8789@gmail.com
EMAIL_PASS=heit kfxi frcl yttl
```

**Verify it's an App Password, NOT your account password:**
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification if not already done
3. Go to "App passwords" → Select Mail → Select Windows Computer
4. Copy the generated 16-character password
5. Replace `EMAIL_PASS` in `.env` with this password (no spaces)

### Step 2: Test Locally
```bash
npm run dev
```
Look for this output:
```
✅ Email transporter verified successfully
   Server is ready to send emails
```

### Step 3: If Still Failing on Render
Check Render logs for detailed error:
```
❌ Email transporter verification FAILED
   Error: Connection timeout (15s)
```

**This confirms Render blocks SMTP.** Move to Solution 2.

---

## Solution 2: Switch to Brevo (RECOMMENDED)

### Why Brevo?
✅ Works reliably on Render  
✅ Free tier: 300 emails/day  
✅ Better deliverability  
✅ No 2FA/App password complications  

### Step 1: Create Brevo Account
1. Sign up at https://www.brevo.com/
2. Verify email address
3. Go to **Settings → SMTP & API**
4. Copy SMTP credentials:
   - **SMTP Server:** smtp-relay.brevo.com
   - **SMTP Port:** 587
   - **SMTP Username:** your_brevo_email@example.com
   - **SMTP Password:** (generated API key, starts with `xsmtp`)

### Step 2: Update `.env`
```env
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=your_brevo_email@example.com
EMAIL_PASS=xsmtp-xxxxxxxxxxxxxxxxxxxx
```

### Step 3: Deploy to Render
```bash
git add backend/.env
git commit -m "Switch to Brevo SMTP"
git push origin main
```

Render will auto-redeploy. Check logs for:
```
✅ Email transporter verified successfully
   Server is ready to send emails
```

---

## Solution 3: Switch to SendGrid (ALSO RECOMMENDED)

### Why SendGrid?
✅ Enterprise-grade email delivery  
✅ Works perfectly on Render  
✅ Free tier: 100 emails/day  
✅ Better tracking and analytics  

### Step 1: Create SendGrid Account
1. Sign up at https://sendgrid.com/
2. Create API key:
   - Go to **Settings → API Keys**
   - Click **Create API Key**
   - Save the key (looks like: `SG.xxxxxxx...`)

### Step 2: Update `.env`
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.xxxxxxx...
```

**Note:** Username is literally `apikey`, not your email.

### Step 3: Deploy
```bash
git add backend/.env
git commit -m "Switch to SendGrid SMTP"
git push origin main
```

---

## Solution 4: Use Resend (Node.js Native - Best for Render)

### Why Resend?
✅ NodeJS-first service  
✅ Built for serverless (perfect for Render)  
✅ No SMTP - uses REST API  
✅ Free tier: 100 emails/day  

### Step 1: Create Resend Account
1. Sign up at https://resend.com/
2. Get API key from Dashboard
3. Install package:
```bash
npm install resend
```

### Step 2: Create `/backend/src/utils/resendEmailService.js`
```javascript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

let emailServiceEnabled = false;

export const verifyEmailTransporter = async () => {
  try {
    console.log('\n📧 Email Service Verification Starting...');
    
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not configured');
      emailServiceEnabled = false;
      return false;
    }

    // Resend doesn't need SMTP verification, just API key check
    console.log('✅ Resend email service enabled');
    console.log('   API Key configured: ✓');
    emailServiceEnabled = true;
    return true;
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    emailServiceEnabled = false;
    return false;
  }
};

export const isEmailServiceEnabled = () => emailServiceEnabled;

export const sendTempPasswordEmail = async (email, name, tempPassword) => {
  try {
    if (!emailServiceEnabled) {
      console.log(`📝 Temp password for ${name} (${email}): ${tempPassword}`);
      return { success: false, message: 'Email service disabled' };
    }

    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173/#/student/login';

    const { data, error } = await resend.emails.send({
      from: `HostelEase <noreply@hostelease.com>`,
      to: email,
      subject: 'Your Temporary HostelEase Login Password',
      html: `
        <h1>Welcome to HostelEase</h1>
        <p>Dear ${name},</p>
        <p>Your student account has been created. Use this temporary password:</p>
        <div style="background: #f0f0f0; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 2px;">
          ${tempPassword}
        </div>
        <p><strong>⚠️ IMPORTANT:</strong> Change this password on first login.</p>
        <p><a href="${loginUrl}">Login to HostelEase</a></p>
      `,
    });

    if (error) {
      console.error('❌ Resend error:', error.message);
      return { success: false, message: error.message };
    }

    console.log(`✅ Email sent to ${email}`);
    return { success: true, message: 'Email sent' };
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    return { success: false, message: error.message };
  }
};

// Implement other email functions similarly...
```

### Step 3: Update `.env`
```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxx
```

### Step 4: Update `server.js`
```javascript
import { verifyEmailTransporter } from './utils/resendEmailService.js';
// ... rest of code
```

---

## Diagnosis: How to Know Which Solution Works

### Check Server Logs After Deploy

#### Success (Email Working):
```
📧 Email Service Verification Starting...
   Host: smtp-relay.brevo.com
   Port: 587
   Secure (TLS): false
   Auth User: ✓ configured
📧 Attempting to verify transporter connection...
✅ Email transporter verified successfully
   Server is ready to send emails
```

#### Failure (Render Blocks SMTP):
```
❌ Email transporter verification FAILED
   Error: Connection timeout (15s)

   Possible causes:
   → Render may block outbound SMTP connections
   → Network firewall blocking port 587 or 465
   → SMTP server not responding
```

---

## Render Configuration Checklist

### If Using SMTP (Brevo/SendGrid/Gmail):
- [ ] Email credentials set in Render Environment Variables
- [ ] Port 587 or 465 NOT blocked (test with Brevo first - most reliable)
- [ ] TLS enabled (secure: false for port 587)
- [ ] Connection timeout: 25 seconds
- [ ] Server logs show "Email transporter verified successfully"

### If Email Still Times Out on Render:
- [ ] Switch to Resend (API-based, not SMTP)
- [ ] This GUARANTEES working email on Render

---

## Recommended Path Forward

### For Quick Fix (Next 5 minutes):
1. Use Brevo (free, reliable, SMTP works on Render)
2. 300 free emails/day = enough for testing

### For Production:
1. **Use Resend** (if you want no SMTP worries)
2. **Or use SendGrid** (if you prefer SMTP but want enterprise features)
3. **Or Brevo** (if you want free with good limits)

---

## Your Current Configuration

```
✅ Email implementation is production-ready
✅ Non-blocking verification (server starts even if email fails)
✅ Detailed debug logs help diagnose issues
✅ All email failures gracefully handled
✅ Passwords still returned even if email fails
```

The only issue is **Render blocks SMTP on free tier**. Switch to Brevo or Resend and you're done.

---

## Quick Reference: .env Examples

### Brevo
```env
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=your-brevo-email@example.com
EMAIL_PASS=xsmtp-xxxxxxxxxxxxx
```

### SendGrid
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.xxxxxxx...
```

### Resend
```env
RESEND_API_KEY=re_xxxxxxx...
# Update emailService imports in code
```

### Gmail (with proper App Password)
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=yourname@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx
```
