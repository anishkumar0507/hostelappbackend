import axios from 'axios';
import { buildReceiptPdfBuffer } from './receiptPdf.js';
// Note: dotenv is loaded in server.js, process.env is available globally

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
 * Core email sending function using Brevo REST API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML email content
 * @returns {Promise<{success: boolean, message: string}>}
 */
const sendEmail = async (to, subject, html) => {
  try {
    // Validate API key
    if (!process.env.BREVO_API_KEY) {
      console.warn('⚠️ BREVO_API_KEY not configured');
      return { success: false, message: 'Email service not configured' };
    }

    // Validate sender email
    if (!process.env.EMAIL_USER) {
      console.warn('⚠️ EMAIL_USER not configured');
      return { success: false, message: 'Email sender not configured' };
    }

    // Validate recipient
    if (!isValidEmail(to)) {
      console.error('❌ Invalid recipient email:', to);
      return { success: false, message: 'Invalid recipient email' };
    }

    console.log(`📧 Sending email to ${to} via Brevo API...`);

    // Call Brevo SMTP Email API
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { 
          email: process.env.EMAIL_USER,
          name: 'HostelEase' 
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 20000, // 20 second timeout
      }
    );

    console.log(`✅ Email sent successfully to ${to}`);
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    const errorMsg = error.message || 'Unknown email error';
    console.error(`❌ Error sending email to ${to}:`, errorMsg);
    
    // Provide diagnostics
    if (error.response?.status === 401) {
      console.error('   → BREVO_API_KEY is invalid or expired');
    } else if (error.response?.status === 400) {
      console.error('   → Invalid email format or request body');
    } else if (error.code === 'ECONNABORTED') {
      console.error('   → Request timeout (20s) - Brevo API not responding');
    } else if (error.code?.includes('ENOTFOUND')) {
      console.error('   → Cannot reach Brevo API endpoint');
    }

    return { success: false, message: errorMsg };
  }
};

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

    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173/#/student/login';

    const html = `
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
    `;

    return await sendEmail(email, 'Your Temporary HostelEase Login Password', html);
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error in sendTempPasswordEmail:', errorMessage);
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

    const loginUrl = (process.env.FRONTEND_URL || 'http://localhost:5173') + '/#/parent/login';

    const html = `
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
    `;

    return await sendEmail(email, 'Your HostelEase Parent Portal Access', html);
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error in sendParentTempPasswordEmail:', errorMessage);
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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
          .receipt-box { background: white; border: 1px solid #e2e8f0; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Receipt</h1>
          </div>
          <div class="content">
            <p>Hi ${studentName || 'Student'},</p>
            <p>Your payment has been received successfully.</p>
            
            <div class="receipt-box">
              <ul style="list-style: none; padding: 0;">
                <li style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong>Amount:</strong> ${formatCurrency(amount)}
                </li>
                <li style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong>Receipt:</strong> ${receiptNumber || 'N/A'}
                </li>
                <li style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
                  <strong>Paid On:</strong> ${paidAt ? new Date(paidAt).toLocaleString('en-IN') : 'N/A'}
                </li>
                <li style="padding: 10px 0;">
                  <strong>Method:</strong> ${method || 'N/A'}
                </li>
              </ul>
            </div>
            
            <p>Thank you for your payment. If you have any questions, please contact the hostel administration.</p>
          </div>
          <div class="footer">
            <p>HostelEase Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail(to, `Payment Receipt - ${receiptNumber || 'HostelEase'}`, html);
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error in sendPaymentReceiptEmail:', errorMessage);
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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
          .reminder-box { background: #fef3c7; border: 2px dashed #d97706; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${studentName || 'Student'},</p>
            <p>This is a reminder that your hostel payment is due soon.</p>
            
            <div class="reminder-box">
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="padding: 10px 0;"><strong>Term:</strong> ${term || 'Hostel Fee'}</li>
                <li style="padding: 10px 0;"><strong>Amount:</strong> ${formatCurrency(amount)}</li>
                <li style="padding: 10px 0;"><strong>Due Date:</strong> ${dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : 'N/A'}</li>
              </ul>
            </div>
            
            <p>Please make the payment before the due date to avoid late fees.</p>
          </div>
          <div class="footer">
            <p>HostelEase Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail(to, 'Upcoming Hostel Payment Due', html);
  } catch (error) {
    const errorMessage = error.message || 'Unknown email error';
    console.error('❌ Error in sendPaymentReminderEmail:', errorMessage);
    return { success: false, message: errorMessage };
  }
};

