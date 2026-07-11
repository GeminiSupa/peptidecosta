const nodemailer = require('nodemailer');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});

const SMTP_HOST = env.SMTP_HOST;
const SMTP_PORT = Number(env.SMTP_PORT || 465);
const SMTP_SECURE = env.SMTP_SECURE !== 'false';
const SMTP_USER = env.SMTP_USER;
const SMTP_PASS = env.SMTP_PASS;

async function test() {
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.verify();
    console.log("SMTP Verify Success:", info);
  } catch (err) {
    console.error("SMTP Verify Failed:", err.message);
  }
}
test();
