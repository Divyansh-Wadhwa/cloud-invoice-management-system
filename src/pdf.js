import PDFDocument from 'pdfkit';

const money = n => `Rs. ${Number(n || 0).toFixed(2)}`;

export function buildInvoicePdf({
  invoiceNumber,
  customer,
  items,
  subtotal,
  discount,
  taxableAmount,
  gstAmount,
  total
}) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const shop = process.env.SHOP_NAME || 'BAKERY WHOLESALE';
    const phone = process.env.SHOP_PHONE || '';
    const address = process.env.SHOP_ADDRESS || '';

    doc.fontSize(22).font('Helvetica-Bold').text(shop, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(address, { align: 'center' });
    if (phone) doc.text(`Phone: ${phone}`, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.8);

    const top = doc.y;
    doc.fontSize(10).font('Helvetica');
    doc.text(`Invoice No: ${invoiceNumber}`, 42, top);
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 380, top);
    doc.moveDown(1.8);

    doc.fontSize(11).font('Helvetica-Bold').text('BILL TO');
    doc.font('Helvetica').fontSize(10).text(customer.name);
    if (customer.phone) doc.text(`Phone: ${customer.phone}`);
    if (customer.email) doc.text(`Email: ${customer.email}`);
    if (customer.address) doc.text(customer.address);
    if (customer.gstin) doc.text(`GSTIN: ${customer.gstin}`);
    doc.moveDown(1);

    const y = doc.y;
    doc.rect(42, y, 511, 24).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9);
    doc.text('ITEM', 50, y + 8);
    doc.text('QTY', 330, y + 8);
    doc.text('PRICE', 385, y + 8);
    doc.text('GST', 445, y + 8);
    doc.text('AMOUNT', 490, y + 8);
    doc.fillColor('#111827').font('Helvetica').fontSize(9);
    doc.y = y + 32;

    for (const item of items) {
      const rowY = doc.y;
      doc.text(item.product_name, 50, rowY, { width: 260 });
      doc.text(`${item.quantity} ${item.unit || ''}`, 330, rowY);
      doc.text(money(item.unit_price), 385, rowY);
      doc.text(`${Number(item.gst_rate).toFixed(1)}%`, 445, rowY);
      doc.text(money(item.amount), 490, rowY);
      doc.moveTo(42, rowY + 18).lineTo(553, rowY + 18).strokeColor('#e5e7eb').stroke();
      doc.strokeColor('#000000');
      doc.y = rowY + 28;
    }

    doc.moveDown(0.8);
    const sx = 380;
    doc.fontSize(10);
    doc.text(`Subtotal: ${money(subtotal)}`, sx, doc.y, { width: 173, align: 'right' });
    doc.text(`Discount: ${money(discount)}`, sx, doc.y + 16, { width: 173, align: 'right' });
    doc.text(`Taxable: ${money(taxableAmount)}`, sx, doc.y + 32, { width: 173, align: 'right' });
    doc.text(`GST: ${money(gstAmount)}`, sx, doc.y + 48, { width: 173, align: 'right' });
    doc.moveTo(sx, doc.y + 68).lineTo(553, doc.y + 68).stroke();
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`TOTAL: ${money(total)}`, sx, doc.y + 78, { width: 173, align: 'right' });

    doc.font('Helvetica').fontSize(9).fillColor('#64748b');
    doc.text('Thank you for your business.', 42, 755, { align: 'center', width: 511 });
    doc.text('Computer-generated invoice.', 42, 770, { align: 'center', width: 511 });

    doc.end();
  });
}
