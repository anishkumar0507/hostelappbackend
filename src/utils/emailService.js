import nodemailer from 'nodemailer';
import { buildReceiptPdfBuffer } from './receiptPdf.js';
// Note: dotenv is loaded in server.js, process.env is available globally

let emailServiceEnabled = false;

/**
 * Email validation helper
 * @param {string} email - Email to validate
 * @returns {boolean} - Whether email is valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Create email transporter with DEBUG LOGGING
 * Returns null if email credentials are not configured
 */
const createTransporter = () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('📧 EMAIL_USER or EMAIL_PASS not configured');
      return null;
    }

    console.log('📧 Creating email transporter...');
    
    // Determine email provider
    const usingCustomHost = process.env.EMAIL_HOST && process.env.EMAIL_PORT;
    const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.EMAIL_PORT || 587, 10);
    const secure = port === 465; // true for 465, false for 587 and others
    
    console.log(`   Host: ${host}`);
    console.log(`   Port: ${port}`);
    console.log(`   Secure (TLS): ${secure}`);
    console.log(`   Auth User: ${process.env.EMAIL_USER ? '✓ configured' : '✗ missing'}`);

    const transporterConfig = usingCustomHost
      ? {
          host,
          port,
          secure,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
          connectionTimeout: 25000,
          greetingTimeout: 25000,
          socketTimeout: 25000,
          logger: process.env.NODE_ENV === 'development',
          debug: process.env.NODE_ENV === 'development',
          tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
          },
        }
      : {
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
          connectionTimeout: 25000,
          greetingTimeout: 25000,
          socketTimeout: 25000,
          logger: process.env.NODE_ENV === 'development',
          debug: process.env.NODE_ENV === 'development',
          tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
          },
        };

    return nodemailer.createTransport(transporterConfig);
  } catch (error) {
    console.error('❌ Error creating email transporter:', error.message);
    return null;
  }
};

/**
 * Verify email transporter connection at server startup
 * Non-blocking: server continues even if email verification fails
 */
export const verifyEmailTransporter = async () => {
  try {
    console.log('\n📧 Email Service Verification Starting...');
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️  Email credentials not configured in .env');
      console.warn('    Email sending will be DISABLED');
      console.warn('    Set EMAIL_USER and EMAIL_PASS to enable email service');
      emailServiceEnabled = false;
      return false;
    }

    const transporter = createTransporter();
    if (!transporter) {
      console.error('❌ Failed to create email transporter instance');
      emailServiceEnabled = false;
      return false;
    }

    console.log('📧 Attempting to verify transporter connection...');
    
    // Attempt verification with 15-second timeout
    const verifyPromise = transporter.verify();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Verification timeout (15s)')), 15000)
    );

    await Promise.race([verifyPromise, timeoutPromise]);
    
    console.log('✅ Email transporter verified successfully');
    console.log('   Server is ready to send emails\n');
    emailServiceEnabled = true;
    return true;
    
  } catch (error) {
    const errorMsg = error.message || error.toString();
    console.error('\n❌ Email transporter verification FAILED');
    console.error(`   Error: ${errorMsg}`);
    console.error('\n   Possible causes:');
    
    if (errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
      console.error('   → Render may block outbound SMTP connections');
      console.error('   → Network firewall blocking port 587 or 465');
      console.error('   → SMTP server not responding');
    }
    if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('getaddrinfo')) {
      console.error('   → EMAIL_HOST value is incorrect or unreachable');
      console.error('   → Current host: ' + process.env.EMAIL_HOST);
    }
    if (errorMsg.includes('Invalid login') || errorMsg.includes('authentication')) {
      console.error('   → EMAIL_USER or EMAIL_PASS is incorrect');
      console.error('   → Gmail requires App Passwords, not account password');
    }
    if (errorMsg.includes('STARTTLS')) {
      console.error('   → TLS/SSL configuration mismatch with port');
    }
    
    console.error('\n   Recommendations:');
    console.error('   1. For Gmail: Use App Passwords (not regular password)');
    console.error('   2. For Render: Switch to Brevo or SendGrid (more reliable)');
    console.error('   3. Check .env EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS');
    console.error('   4. Verify Google Account 2FA is enabled for Gmail App Passwords');
    console.error('\n');
    
    emailServiceEnabled = false;
    return false;
  }
};

/**
 * Check if email service is enabled
 */
export const isEmailServiceEnabled = () => emailServiceEnabled;

/**
 * Send temporary password email to student
 * @param {string} email - Student email
 * @param {string} name - Student name
 * @param {string} tempPassword - Temporary password
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const sendTempPasswordEmail = async (email, name, tempPassword) => {
  try {
    // Validate email format
    if (!isValidEmail(email)) {
      console.error('❌ Invalid email format:', email);
      return { success: false, message: 'Invalid email address' };
    }

    // Check if email service is enabled
    if (!emailServiceEnabled) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      console.log(`📝 Temporary password for ${name} (${email}): ${tempPassword}`);
      return { success: false, message: 'Email service disabled' };
    }

    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Email credentials not configured. Skipping email send.');
      console.log(`📝 Temporary password for ${name} (${email}): ${tempPassword}`);
      return { success: false, message: 'Email service not configured' };
    }

    // Create transporter
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('⚠️ Could not create email transporter. Skipping email send.');
      console.log(`📝 Temporary password for ${name} (${email}): ${tempPassword}`);
      return { success: false, message: 'Email transporter creation failed' };
    }

    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173/#/student/login';

    const mailOptions = {
      from: `"HostelEase" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Temporary HostelEase Login Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .password-box { background: white; border: 2px dashed #4f46e5; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
            .password { font-size: 24px; font-weight: bold; color: #4f46e5; letter-spacing: 2px; font-family: monospace; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to HostelEase</h1>
            </div>
            <div class="content">
              <p>Dear ${name},</p>
              
              <p>Your student account has been created in the HostelEase system. Please use the temporary password below to log in for the first time.</p>
              
              <div class="password-box">
                <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">Your Temporary Password:</p>
                <div class="password">${tempPassword}</div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important:</strong> This is a one-time temporary password. You <strong>must</strong> change your password immediately after your first login for security reasons.
              </div>
              
              <p><strong>Login Instructions:</strong></p>
              <ol>
                <li>Go to the login page: <a href="${loginUrl}">${loginUrl}</a></li>
                <li>Enter your email: <strong>${email}</strong></li>
                <li>Enter the temporary password shown above</li>
                <li>After logging in, you will be prompted to set a new password</li>
              </ol>
              
              <p style="text-align: center;">
                <a href="${loginUrl}" class="button">Login to HostelEase</a>
              </p>
              
              <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                <strong>Security Note:</strong> Never share your password with anyone. If you did not request this account, please contact your warden immediately.
              </p>
            </div>
            <div class="footer">
              <p>This is an automated message from HostelEase Management System.</p>
              <p>Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to HostelEase

Dear ${name},

Your student account has been created in the HostelEase system. Please use the temporary password below to log in for the first time.

Your Temporary Password: ${tempPassword}

⚠️ IMPORTANT: This is a one-time temporary password. You MUST change your password immediately after your first login for security reasons.

Login Instructions:
1. Go to the login page: ${loginUrl}
2. Enter your email: ${email}
3. Enter the temporary password shown above
4. After logging in, you will be prompted to set a new password

Security Note: Never share your password with anyone. If you did not request this account, please contact your warden immediately.

This is an automated message from HostelEase Management System.
      `,
    };

    // Send email with proper timeout handling
    await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout after 25 seconds')), 25000)
      )
    ]);
    
    console.log(`✅ Temporary password email sent successfully to ${email}`);
    return { success: true, message: 'Email sent to student' };
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error sending temporary password email:', errorMessage);
    return { success: false, message: errorMessage };
  }
};

/**
 * Send temporary password email to parent/guardian
 * @param {string} email - Parent email
 * @param {string} name - Parent name
 * @param {string} tempPassword - Temporary password
 * @param {string} studentName - Name of the child (student) they are linked to
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const sendParentTempPasswordEmail = async (email, name, tempPassword, studentName) => {
  try {
    // Validate email format
    if (!isValidEmail(email)) {
      console.error('❌ Invalid email format:', email);
      return { success: false, message: 'Invalid email address' };
    }

    // Check if email service is enabled
    if (!emailServiceEnabled) {
      console.warn('⚠️ Email service is disabled. Skipping email send.');
      console.log(`📝 Parent temp password for ${name} (${email}): ${tempPassword}`);
      return { success: false, message: 'Email service disabled' };
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Email credentials not configured. Skipping parent email send.');
      console.log(`📝 Parent temp password for ${name} (${email}): ${tempPassword}`);
      return { success: false, message: 'Email service not configured' };
    }

    const transporter = createTransporter();
    if (!transporter) {
      console.warn('⚠️ Could not create email transporter. Skipping parent email send.');
      console.log(`📝 Parent temp password for ${name} (${email}): ${tempPassword}`);
      return { success: false, message: 'Email transporter creation failed' };
    }

    const loginUrl = (process.env.FRONTEND_URL || 'http://localhost:5173') + '/#/parent/login';

    const mailOptions = {
      from: `"HostelEase" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your HostelEase Parent Portal Access',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .password-box { background: white; border: 2px dashed #059669; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
            .password { font-size: 24px; font-weight: bold; color: #059669; letter-spacing: 2px; font-family: monospace; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .button { display: inline-block; background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>HostelEase Parent Portal</h1>
            </div>
            <div class="content">
              <p>Dear ${name},</p>
              
              <p>You have been registered as a parent/guardian for <strong>${studentName}</strong> in the HostelEase system. Use the temporary password below to log in and view your child's hostel information.</p>
              
              <div class="password-box">
                <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">Your Temporary Password:</p>
                <div class="password">${tempPassword}</div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important:</strong> You <strong>must</strong> change your password on first login for security.
              </div>
              
              <p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
              <p>Email: <strong>${email}</strong></p>
              
              <p style="text-align: center;">
                <a href="${loginUrl}" class="button">Access Parent Portal</a>
              </p>
            </div>
            <div class="footer">
              <p>HostelEase Management System - Parent Portal</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
HostelEase Parent Portal

Dear ${name},

You have been registered as a parent/guardian for ${studentName}. Use the temporary password below to log in.

Temporary Password: ${tempPassword}

⚠️ Change your password on first login.

Login: ${loginUrl}
Email: ${email}

HostelEase Management System.
      `,
    };

    await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timeout after 25 seconds')), 25000)),
    ]);
    console.log(`✅ Parent temporary password email sent successfully to ${email}`);
    return { success: true, message: 'Email sent to parent' };
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error sending parent email:', errorMessage);
    return { success: false, message: errorMessage };
  }
};

const formatCurrency = (value) => `INR ${Number(value || 0).toLocaleString('en-IN')}`;

/**
 * Send payment receipt email
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const sendPaymentReceiptEmail = async ({
  to,
  studentName,
  studentEmail,
  amount,
  paidAt,
  method,
  receiptNumber,
  items = [],
}) => {
  try {
    // Validate email format
    if (!isValidEmail(to)) {
      console.error('❌ Invalid email format for receipt:', to);
      return { success: false, message: 'Invalid email address' };
    }

    // Check if email service is enabled
    if (!emailServiceEnabled) {
      console.warn('⚠️ Email service is disabled. Skipping receipt email.');
      return { success: false, message: 'Email service disabled' };
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Email credentials not configured. Skipping receipt email.');
      return { success: false, message: 'Email service not configured' };
    }

    const transporter = createTransporter();
    if (!transporter) {
      console.warn('⚠️ Could not create email transporter. Skipping receipt email.');
      return { success: false, message: 'Email transporter creation failed' };
    }

    const pdfBuffer = await buildReceiptPdfBuffer({
      receiptNumber,
      studentName,
      studentEmail,
      amount,
      paidAt,
      method,
      items,
    });

    const mailOptions = {
      from: `"HostelEase" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Payment Receipt - ${receiptNumber || 'HostelEase'}`,
      html: `
        <p>Hi ${studentName || 'Student'},</p>
        <p>Your payment has been received successfully.</p>
        <ul>
          <li><strong>Amount:</strong> ${formatCurrency(amount)}</li>
          <li><strong>Receipt:</strong> ${receiptNumber || 'N/A'}</li>
          <li><strong>Paid On:</strong> ${paidAt ? new Date(paidAt).toLocaleString('en-IN') : 'N/A'}</li>
          <li><strong>Method:</strong> ${method || 'N/A'}</li>
        </ul>
        <p>Your receipt is attached as a PDF.</p>
      `,
      attachments: [
        {
          filename: `Receipt-${receiptNumber || 'HostelEase'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timeout after 25 seconds')), 25000)),
    ]);

    console.log(`✅ Payment receipt email sent successfully to ${to}`);
    return { success: true, message: 'Receipt sent to email' };
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error sending payment receipt email:', errorMessage);
    return { success: false, message: errorMessage };
  }
};

/**
 * Send payment reminder email
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const sendPaymentReminderEmail = async ({
  to,
  studentName,
  dueDate,
  amount,
  term,
}) => {
  try {
    // Validate email format
    if (!isValidEmail(to)) {
      console.error('❌ Invalid email format for reminder:', to);
      return { success: false, message: 'Invalid email address' };
    }

    // Check if email service is enabled
    if (!emailServiceEnabled) {
      console.warn('⚠️ Email service is disabled. Skipping reminder email.');
      return { success: false, message: 'Email service disabled' };
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Email credentials not configured. Skipping reminder email.');
      return { success: false, message: 'Email service not configured' };
    }

    const transporter = createTransporter();
    if (!transporter) {
      console.warn('⚠️ Could not create email transporter. Skipping reminder email.');
      return { success: false, message: 'Email transporter creation failed' };
    }

    const mailOptions = {
      from: `"HostelEase" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Upcoming Hostel Payment Due',
      html: `
        <p>Hi ${studentName || 'Student'},</p>
        <p>This is a reminder that your hostel payment is due soon.</p>
        <ul>
          <li><strong>Term:</strong> ${term || 'Hostel Fee'}</li>
          <li><strong>Amount:</strong> ${formatCurrency(amount)}</li>
          <li><strong>Due Date:</strong> ${dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : 'N/A'}</li>
        </ul>
        <p>Please make the payment before the due date to avoid late fees.</p>
      `,
    };

    await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timeout after 25 seconds')), 25000)),
    ]);

    console.log(`✅ Payment reminder email sent successfully to ${to}`);
    return { success: true, message: 'Reminder sent to email' };
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error sending payment reminder email:', errorMessage);
    return { success: false, message: errorMessage };
  }
};
