const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { Resend } = require('resend');

// Initialize Resend if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

// Email transporter setup (Fallback)
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Helper function to send email via Resend or Nodemailer
const sendEmail = async ({ to, subject, html, attachments }) => {
  // Try Resend first
  if (resend) {
    try {
      const resendAttachments = attachments ? attachments.map(a => ({
        filename: a.filename,
        content: a.content
      })) : undefined;

      // For inline images (CID), Resend handles them differently.
      // If we have CID references, we might need to adjust HTML for Resend, 
      // but for simplicity, we'll send as regular attachments in Resend 
      // which is usually sufficient, or let the user know inline might break without proper hosting.
      // However, for QR codes, attaching is usually fine.
      
      await resend.emails.send({
        from: resendFromEmail,
        to,
        subject,
        html,
        attachments: resendAttachments
      });
      console.log(`Email sent via Resend to: ${to}`);
      return;
    } catch (error) {
      console.error('Resend error, falling back to Nodemailer:', error);
      // Fallback to Nodemailer if Resend fails
    }
  }

  // Fallback to Nodemailer
  try {
    const transporter = createEmailTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
      attachments
    });
    console.log(`Email sent via Nodemailer to: ${to}`);
  } catch (error) {
    console.error('Nodemailer error:', error);
    throw error;
  }
};

// Twilio client setup
const createTwilioClient = () => {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return null;
};

// Send welcome email
const sendWelcomeEmail = async (userEmail, firstName) => {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome ${firstName}!</h2>
        <p>Thank you for registering with our Event & Club Management Portal.</p>
        <p>You can now:</p>
        <ul>
          <li>Browse and book events</li>
          <li>Join clubs and communities</li>
          <li>Manage your bookings</li>
          <li>Receive event updates</li>
        </ul>
        <p>If you have any questions, feel free to contact us.</p>
        <p>Best regards,<br>The Event Management Team</p>
      </div>
    `;

    await sendEmail({
      to: userEmail,
      subject: 'Welcome to Event & Club Management Portal',
      html
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

// Send booking confirmation email
const sendBookingConfirmationEmail = async (userEmail, firstName, eventDetails, qrCodeImage) => {
  try {
    // Convert data URL to Buffer for email attachment
    let qrCodeBuffer = null;
    let attachments = [];
    
    if (qrCodeImage) {
      try {
        // Extract base64 data from data URL (format: data:image/png;base64,...)
        const base64Data = qrCodeImage.replace(/^data:image\/\w+;base64,/, '');
        qrCodeBuffer = Buffer.from(base64Data, 'base64');
        
        // Attach QR code as inline image with CID
        attachments.push({
          filename: 'qrcode.png',
          content: qrCodeBuffer,
          cid: 'qrcode', // Content-ID for referencing in HTML
          contentType: 'image/png'
        });
        console.log('QR code attached to email (size:', qrCodeBuffer.length, 'bytes)');
      } catch (bufferError) {
        console.error('Error converting QR code to buffer:', bufferError);
      }
    } else {
      console.warn('No QR code image provided for booking confirmation email');
    }
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Booking Confirmed!</h2>
        <p>Hi ${firstName},</p>
        <p>Your booking for <strong>${eventDetails.title}</strong> has been confirmed.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3>Event Details:</h3>
          <p><strong>Date:</strong> ${new Date(eventDetails.date).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${new Date(eventDetails.date).toLocaleTimeString()}</p>
          <p><strong>Venue:</strong> ${eventDetails.venue}</p>
          <p><strong>Club:</strong> ${eventDetails.clubName}</p>
        </div>
        
        <div style="text-align: center; margin: 20px 0;">
          <h3>Your QR Code:</h3>
          ${qrCodeBuffer ? '<img src="cid:qrcode" alt="QR Code" style="max-width: 200px; border: 1px solid #ddd; padding: 10px; background: white; display: block; margin: 0 auto;">' : '<p style="color: #999;">QR Code unavailable</p>'}
          <p style="font-size: 12px; color: #666; margin-top: 10px;">Please bring this QR code to the event for check-in</p>
        </div>
        
        <p>We look forward to seeing you at the event!</p>
        <p>Best regards,<br>The Event Management Team</p>
      </div>
    `;

    await sendEmail({
      to: userEmail,
      subject: `Booking Confirmation - ${eventDetails.title}`,
      html,
      attachments
    });
  } catch (error) {
    console.error('Error sending booking confirmation email:', error);
  }
};

// Send event reminder email
const sendEventReminderEmail = async (userEmail, firstName, eventDetails) => {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Event Reminder</h2>
        <p>Hi ${firstName},</p>
        <p>This is a friendly reminder that you have an event tomorrow:</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3>${eventDetails.title}</h3>
          <p><strong>Date:</strong> ${new Date(eventDetails.date).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${new Date(eventDetails.date).toLocaleTimeString()}</p>
          <p><strong>Venue:</strong> ${eventDetails.venue}</p>
          <p><strong>Club:</strong> ${eventDetails.clubName}</p>
        </div>
        
        <p>Don't forget to bring your QR code for check-in!</p>
        <p>We look forward to seeing you there.</p>
        <p>Best regards,<br>The Event Management Team</p>
      </div>
    `;

    await sendEmail({
      to: userEmail,
      subject: `Event Reminder - ${eventDetails.title} Tomorrow`,
      html
    });
  } catch (error) {
    console.error('Error sending event reminder email:', error);
  }
};

// Send OTP email
const sendOTPEmail = async (userEmail, otp) => {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Email Verification</h2>
        <p>Thank you for registering with our Event & Club Management Portal.</p>
        <p>Please use the following OTP to verify your email address:</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center;">
          <h1 style="color: #8b5cf6; font-size: 36px; margin: 0; letter-spacing: 8px;">${otp}</h1>
        </div>
        
        <p style="color: #666; font-size: 12px;">This OTP will expire in 10 minutes.</p>
        <p style="color: #666; font-size: 12px;">If you didn't request this OTP, please ignore this email.</p>
        
        <p>Best regards,<br>The Event Management Team</p>
      </div>
    `;

    await sendEmail({
      to: userEmail,
      subject: 'Email Verification OTP - Event & Club Management Portal',
      html
    });
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

// Send SMS notification (optional)
const sendSMSNotification = async (phoneNumber, message) => {
  try {
    const client = createTwilioClient();
    
    if (!client) {
      console.log('Twilio not configured, skipping SMS');
      return;
    }

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log('SMS sent to:', phoneNumber);
  } catch (error) {
    console.error('Error sending SMS:', error);
  }
};

module.exports = {
  sendWelcomeEmail,
  sendBookingConfirmationEmail,
  sendEventReminderEmail,
  sendOTPEmail,
  sendSMSNotification
};