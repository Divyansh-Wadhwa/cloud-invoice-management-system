import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import 'dotenv/config';

const client = new SESv2Client({ region: process.env.AWS_REGION });

function mimeHeader(value) {
  return String(value).replace(/[\r\n]/g, ' ');
}

export async function sendInvoiceEmail({ to, invoiceNumber, customerName, pdfBuffer }) {
  const from = process.env.SES_FROM_EMAIL;
  if (!from) throw new Error('SES_FROM_EMAIL is not configured');
  if (!to) throw new Error('Customer email is missing');

  const boundary = `----=_Invoice_${Date.now()}`;
  const subject = `Invoice ${invoiceNumber} - ${process.env.SHOP_NAME || 'Your Store'}`;
  const body = [
    `Dear ${customerName},`,
    '',
    `Please find your invoice ${invoiceNumber} attached.`,
    '',
    `Thank you for your business.`,
    process.env.SHOP_NAME || 'Your Store'
  ].join('\\n');

  const attachment = pdfBuffer.toString('base64').match(/.{1,76}/g)?.join('\\r\\n') || '';
  const raw = [
    `From: ${mimeHeader(from)}`,
    `To: ${mimeHeader(to)}`,
    `Subject: ${mimeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
    '',
    `--${boundary}`,
    'Content-Type: application/pdf; name="invoice.pdf"',
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${invoiceNumber}.pdf"`,
    '',
    attachment,
    '',
    `--${boundary}--`
  ].join('\\r\\n');

  await client.send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: { Raw: { Data: Buffer.from(raw) } }
  }));
}
