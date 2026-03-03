# Quick Fix: Switch to Brevo SMTP (5 Minutes)

## Why Brevo?
✅ **Works on Render** (most reliable SMTP for Render)
✅ **300 free emails/day** (perfect for testing/production)
✅ **No 2FA complications** like Gmail
✅ **Drop-in replacement** (no code changes needed)
✅ **Better deliverability** than Gmail from servers

---

## Step 1: Create Brevo Account (2 minutes)

### Go to https://www.brevo.com/
1. Click **Sign Up**
2. Fill in email and password
3. **Verify your email** (check inbox)
4. Login

---

## Step 2: Get SMTP Credentials (1 minute)

### In Brevo Dashboard:
1. Click **Settings** (bottom left)
2. Click **SMTP & API**
3. Under **SMTP Details**, you'll see:
   ```
   SMTP Server: smtp-relay.brevo.com
   SMTP Port: 587
   Secure Connection: StartTLS (required)
   ```
4. Under **SMTP & API credentials**:
   - **SMTP Login:** your-brevo-email@example.com
   - **SMTP Password:** [Click to reveal] → Copy this (starts with "xsmtp-")

---

## Step 3: Update .env (1 minute)

### Current .env in backend/:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=anishsinghaniya8789@gmail.com
EMAIL_PASS=heit kfxi frcl yttl
```

### Change to:
```env
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=your-brevo-email@example.com
EMAIL_PASS=xsmtp-your-generated-key-here
```

**Example:**
```env
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=hostelease@brevo.com
EMAIL_PASS=xsmtp-12345678901234567890
```

---

## Step 4: Deploy (1 minute)

### In terminal:
```bash
cd c:\Users\manis\Downloads\hostelease-student-portal\ version\ 2\hostelease-student-portal\ version\ 1

# Stage changes
git add backend/.env

# Commit
git commit -m "Switch to Brevo SMTP - fixes Render email timeout"

# Push
git push origin main
```

### Wait for Render to redeploy (2-3 minutes)

---

## Step 5: Verify in Render Logs

### Go to Render Dashboard:
1. Select your backend service
2. Click **Logs** tab
3. Scroll up to server startup
4. Look for:

### ✅ Success:
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

### ❌ Still Failing:
```
❌ Email transporter verification FAILED
   Error: Connection timeout (15s)
   → Render may block outbound SMTP connections
```

If still failing, use **Resend** (API-based, guaranteed to work).

---

## That's It!

Your email system should now work on Render.

### Test it by:
1. Creating a student through the API
2. Check Render logs for:
   ```
   ✅ Temporary password email sent successfully to [email]
   ```

---

## If Still Failing

### Option A: Try SendGrid instead
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.your_sendgrid_key
```

### Option B: Use Resend (API-based, guaranteed to work)

See **RENDER_EMAIL_FIX.md** for Resend setup.

---

## Brevo Credentials Reminder

| Setting | Value |
|---------|-------|
| SMTP Host | `smtp-relay.brevo.com` |
| SMTP Port | `587` |
| Security | StartTLS (secure: false) |
| Username | Your Brevo registration email |
| Password | xsmtp-xxxxx... |

---

## Free Tier Limits with Brevo

- 300 emails/day ✅ Plenty for dev/test
- Unlimited contacts
- Basic automation
- Email logs for 90 days

Perfect for your hostel management system!

---

## Important Notes

1. **Keep .env private** - Don't commit to public repos
2. **Monitor email usage** - Dashboard shows daily usage
3. **Test locally first:**
   ```bash
   npm run dev
   # Should show: ✅ Email transporter verified successfully
   ```

4. **Production ready** - Brevo is used by enterprise customers

---

## Next: Test Email Sending

Once verification succeeds, test creating a student:

```bash
curl -X POST https://your-render-backend-url/api/students \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Test Student",
    "email": "test@example.com",
    "studentClass": "12",
    "rollNumber": "001"
  }'
```

Check Render logs for:
```
✅ Temporary password email sent successfully to test@example.com
```

Done! ✨
