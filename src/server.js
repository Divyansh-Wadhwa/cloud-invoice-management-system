import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './db.js';
import { uploadPdf, createDownloadUrl, deletePdf } from './s3.js';
import { buildInvoicePdf } from './pdf.js';
import { sendInvoiceEmail } from './email.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected', service: 'cloud-invoice-billing' });
}));

// PRODUCTS
app.get('/api/products', asyncRoute(async (req, res) => {
  const search = String(req.query.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    const [rows] = await pool.query(
      `SELECT * FROM products WHERE active=1 AND (name LIKE ? OR barcode LIKE ?) ORDER BY name LIMIT 50`,
      [like, like]
    );
    return res.json(rows);
  }
  const [rows] = await pool.query('SELECT * FROM products ORDER BY name');
  res.json(rows);
}));

app.get('/api/products/barcode/:barcode', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM products WHERE barcode=? AND active=1 LIMIT 1',
    [req.params.barcode]
  );
  if (!rows.length) return res.status(404).json({ error: 'Product not found for this barcode' });
  res.json(rows[0]);
}));

app.post('/api/products', asyncRoute(async (req, res) => {
  const { barcode, name, description = '', unit = 'pcs', selling_price, gst_rate = 0, hsn_code = '' } = req.body;
  if (!barcode || !name || selling_price === undefined) {
    return res.status(400).json({ error: 'Barcode, product name and selling price are required' });
  }
  const price = Number(selling_price);
  const gst = Number(gst_rate);
  if (!(price >= 0) || !(gst >= 0)) return res.status(400).json({ error: 'Invalid price or GST rate' });

  try {
    const [r] = await pool.query(
      `INSERT INTO products(barcode,name,description,unit,selling_price,gst_rate,hsn_code)
       VALUES(?,?,?,?,?,?,?)`,
      [String(barcode).trim(), name.trim(), description.trim(), unit, price, gst, hsn_code.trim()]
    );
    const [[product]] = await pool.query('SELECT * FROM products WHERE id=?', [r.insertId]);
    res.status(201).json(product);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A product with this barcode already exists' });
    throw e;
  }
}));

app.put('/api/products/:id', asyncRoute(async (req, res) => {
  const { barcode, name, description = '', unit = 'pcs', selling_price, gst_rate = 0, hsn_code = '', active = true } = req.body;
  await pool.query(
    `UPDATE products SET barcode=?,name=?,description=?,unit=?,selling_price=?,gst_rate=?,hsn_code=?,active=?
     WHERE id=?`,
    [String(barcode).trim(), name.trim(), description.trim(), unit, Number(selling_price), Number(gst_rate), hsn_code.trim(), !!active, req.params.id]
  );
  const [[product]] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  res.json(product);
}));

app.delete('/api/products/:id', asyncRoute(async (req, res) => {
  const [result] = await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Product not found' });
  res.status(204).end();
}));

// CUSTOMERS
app.get('/api/customers', asyncRoute(async (req, res) => {
  const search = String(req.query.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    const [rows] = await pool.query(
      `SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY name LIMIT 50`,
      [like, like, like]
    );
    return res.json(rows);
  }
  const [rows] = await pool.query('SELECT * FROM customers ORDER BY name');
  res.json(rows);
}));

app.post('/api/customers', asyncRoute(async (req, res) => {
  const { name, phone = '', email = '', address = '', gstin = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Customer name is required' });
  const [r] = await pool.query(
    `INSERT INTO customers(name,phone,email,address,gstin) VALUES(?,?,?,?,?)`,
    [name.trim(), phone.trim(), email.trim(), address.trim(), gstin.trim()]
  );
  const [[customer]] = await pool.query('SELECT * FROM customers WHERE id=?', [r.insertId]);
  res.status(201).json(customer);
}));

app.delete('/api/customers/:id', asyncRoute(async (req, res) => {
  const [[invoice]] = await pool.query(
    'SELECT id FROM invoices WHERE customer_id=? LIMIT 1',
    [req.params.id]
  );
  if (invoice) {
    return res.status(409).json({ error: 'Customer cannot be removed because invoices exist for this account' });
  }

  const [result] = await pool.query('DELETE FROM customers WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Customer not found' });
  res.status(204).end();
}));

// DASHBOARD
app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const [[sales]] = await pool.query(
    `SELECT COALESCE(SUM(total),0) total_sales, COUNT(*) invoice_count
     FROM invoices WHERE DATE(created_at)=CURDATE()`
  );
  const [[customers]] = await pool.query('SELECT COUNT(*) count FROM customers');
  const [[products]] = await pool.query('SELECT COUNT(*) count FROM products WHERE active=1');
  res.json({
    today_sales: Number(sales.total_sales),
    today_invoices: Number(sales.invoice_count),
    customers: Number(customers.count),
    products: Number(products.count)
  });
}));

// INVOICES
app.get('/api/invoices', asyncRoute(async (req, res) => {
  const search = String(req.query.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    const [rows] = await pool.query(
      `SELECT id,invoice_number,customer_name,total,email_status,payment_status,created_at
       FROM invoices
       WHERE invoice_number LIKE ? OR customer_name LIKE ?
       ORDER BY id DESC LIMIT 100`,
      [like, like]
    );
    return res.json(rows);
  }
  const [rows] = await pool.query(
    `SELECT id,invoice_number,customer_name,total,email_status,payment_status,created_at
     FROM invoices ORDER BY id DESC LIMIT 100`
  );
  res.json(rows);
}));

app.get('/api/invoices/:id', asyncRoute(async (req, res) => {
  const [[invoice]] = await pool.query('SELECT * FROM invoices WHERE id=?', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id', [req.params.id]);
  res.json({ ...invoice, items });
}));

app.get('/api/invoices/:id/download', asyncRoute(async (req, res) => {
  const [[invoice]] = await pool.query('SELECT pdf_key,invoice_number FROM invoices WHERE id=?', [req.params.id]);
  if (!invoice?.pdf_key) return res.status(404).json({ error: 'Invoice PDF not found' });
  res.json({ url: await createDownloadUrl(invoice.pdf_key), invoice_number: invoice.invoice_number });
}));

app.delete('/api/invoices/:id', asyncRoute(async (req, res) => {
  const [[invoice]] = await pool.query(
    'SELECT pdf_key FROM invoices WHERE id=?',
    [req.params.id]
  );
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  if (invoice.pdf_key) await deletePdf(invoice.pdf_key);

  const [result] = await pool.query('DELETE FROM invoices WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Invoice not found' });
  res.status(204).end();
}));

app.put('/api/invoices/:id', asyncRoute(async (req, res) => {
  const { customer_id, items, discount = 0, email_invoice = true } = req.body;
  if (!customer_id || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Customer and at least one item are required' });
  }

  const [[existing]] = await pool.query(
    'SELECT * FROM invoices WHERE id=?',
    [req.params.id]
  );
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const [[customer]] = await pool.query('SELECT * FROM customers WHERE id=?', [customer_id]);
  if (!customer) return res.status(400).json({ error: 'Customer not found' });

  const normalized = [];
  let subtotal = 0;
  let gstAmount = 0;

  for (const line of items) {
    const [[p]] = await pool.query('SELECT * FROM products WHERE id=?', [line.product_id]);
    if (!p) throw new Error(`Product ${line.product_id} not found`);

    const quantity = Number(line.quantity);
    const unitPrice = line.unit_price_override !== undefined
      ? Number(line.unit_price_override)
      : Number(p.selling_price);
    if (!(quantity > 0)) throw new Error(`Invalid quantity for ${p.name}`);
    if (!(unitPrice >= 0)) throw new Error(`Invalid price for ${p.name}`);

    const amount = quantity * unitPrice;
    const lineGst = amount * Number(p.gst_rate || 0) / 100;
    subtotal += amount;
    gstAmount += lineGst;
    normalized.push({
      product_id: p.id,
      barcode: p.barcode,
      product_name: p.name,
      unit: p.unit,
      quantity,
      unit_price: unitPrice,
      gst_rate: Number(p.gst_rate || 0),
      gst_amount: lineGst,
      amount
    });
  }

  const safeDiscount = Math.max(0, Number(discount || 0));
  if (safeDiscount > subtotal) throw new Error('Discount cannot exceed subtotal');
  const taxableAmount = subtotal - safeDiscount;
  gstAmount = subtotal > 0 ? gstAmount * (taxableAmount / subtotal) : 0;
  const total = taxableAmount + gstAmount;
  const pdfBuffer = await buildInvoicePdf({
    invoiceNumber: existing.invoice_number,
    customer,
    items: normalized,
    subtotal,
    discount: safeDiscount,
    taxableAmount,
    gstAmount,
    total
  });

  const newKey = `invoices/${new Date().getFullYear()}/${existing.invoice_number}-${Date.now()}.pdf`;
  await uploadPdf(newKey, pdfBuffer);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE invoices SET customer_id=?,customer_name=?,customer_email=?,customer_phone=?,
       customer_address=?,customer_gstin=?,subtotal=?,discount=?,taxable_amount=?,gst_amount=?,
       total=?,pdf_key=?,email_status=? WHERE id=?`,
      [
        customer.id, customer.name, customer.email, customer.phone, customer.address,
        customer.gstin, subtotal, safeDiscount, taxableAmount, gstAmount, total, newKey,
        email_invoice && customer.email ? 'PENDING' : 'SKIPPED', req.params.id
      ]
    );
    await conn.query('DELETE FROM invoice_items WHERE invoice_id=?', [req.params.id]);
    for (const i of normalized) {
      const adjustedGst = subtotal > 0 ? i.gst_amount * (taxableAmount / subtotal) : 0;
      await conn.query(
        `INSERT INTO invoice_items
         (invoice_id,product_id,barcode,product_name,unit,quantity,unit_price,gst_rate,gst_amount,amount)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [req.params.id, i.product_id, i.barcode, i.product_name, i.unit, i.quantity, i.unit_price, i.gst_rate, adjustedGst, i.amount]
      );
    }
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch {}
    try { await deletePdf(newKey); } catch {}
    throw e;
  } finally {
    conn.release();
  }

  if (existing.pdf_key) await deletePdf(existing.pdf_key);

  let emailStatus = email_invoice && customer.email ? 'PENDING' : 'SKIPPED';
  let emailError = null;
  if (email_invoice && customer.email) {
    try {
      await sendInvoiceEmail({
        to: customer.email,
        invoiceNumber: existing.invoice_number,
        customerName: customer.name,
        pdfBuffer
      });
      emailStatus = 'SENT';
      await pool.query('UPDATE invoices SET email_status=? WHERE id=?', ['SENT', req.params.id]);
    } catch (e) {
      emailStatus = 'FAILED';
      emailError = e.message;
      await pool.query('UPDATE invoices SET email_status=? WHERE id=?', ['FAILED', req.params.id]);
    }
  }

  res.json({
    success: true,
    id: Number(req.params.id),
    invoice_number: existing.invoice_number,
    subtotal,
    discount: safeDiscount,
    taxableAmount,
    gstAmount,
    total,
    pdf_key: newKey,
    email_status: emailStatus,
    email_error: emailError,
    download_url: await createDownloadUrl(newKey)
  });
}));

app.post('/api/invoices', asyncRoute(async (req, res) => {
  const { customer_id, items, discount = 0, email_invoice = true } = req.body;
  if (!customer_id || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Customer and at least one item are required' });
  }

  const conn = await pool.getConnection();
  let invoiceId;
  let invoiceNumber;
  let pdfBuffer;
  let customer;
  let totals;

  try {
    await conn.beginTransaction();

    [[customer]] = await conn.query('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!customer) throw new Error('Customer not found');

    const normalized = [];
    let subtotal = 0;
    let gstAmount = 0;

    for (const line of items) {
      const [[p]] = await conn.query('SELECT * FROM products WHERE id=? AND active=1', [line.product_id]);
      if (!p) throw new Error(`Product ${line.product_id} not found or inactive`);

      const quantity = Number(line.quantity);
      const unitPrice = line.unit_price_override !== undefined
        ? Number(line.unit_price_override)
        : Number(p.selling_price);

      if (!(quantity > 0)) throw new Error(`Invalid quantity for ${p.name}`);
      if (!(unitPrice >= 0)) throw new Error(`Invalid price for ${p.name}`);

      const amount = quantity * unitPrice;
      const lineGst = amount * Number(p.gst_rate || 0) / 100;
      subtotal += amount;
      gstAmount += lineGst;

      normalized.push({
        product_id: p.id,
        barcode: p.barcode,
        product_name: p.name,
        unit: p.unit,
        quantity,
        unit_price: unitPrice,
        gst_rate: Number(p.gst_rate || 0),
        gst_amount: lineGst,
        amount
      });
    }

    const safeDiscount = Math.max(0, Number(discount || 0));
    if (safeDiscount > subtotal) throw new Error('Discount cannot exceed subtotal');

    // GST is recalculated after discount proportionally across the taxable amount.
    const taxableAmount = subtotal - safeDiscount;
    const grossTaxBeforeDiscount = gstAmount;
    gstAmount = subtotal > 0 ? grossTaxBeforeDiscount * (taxableAmount / subtotal) : 0;
    const total = taxableAmount + gstAmount;

    invoiceNumber = `INV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(Date.now()).slice(-6)}`;

    const [ir] = await conn.query(
      `INSERT INTO invoices
       (invoice_number,customer_id,customer_name,customer_email,customer_phone,customer_address,customer_gstin,
        subtotal,discount,taxable_amount,gst_amount,total)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        invoiceNumber, customer.id, customer.name, customer.email, customer.phone,
        customer.address, customer.gstin, subtotal, safeDiscount, taxableAmount, gstAmount, total
      ]
    );
    invoiceId = ir.insertId;

    for (const i of normalized) {
      const adjustedGst = subtotal > 0 ? i.gst_amount * (taxableAmount / subtotal) : 0;
      await conn.query(
        `INSERT INTO invoice_items
         (invoice_id,product_id,barcode,product_name,unit,quantity,unit_price,gst_rate,gst_amount,amount)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [invoiceId, i.product_id, i.barcode, i.product_name, i.unit, i.quantity, i.unit_price, i.gst_rate, adjustedGst, i.amount]
      );
    }

    pdfBuffer = await buildInvoicePdf({
      invoiceNumber,
      customer,
      items: normalized,
      subtotal,
      discount: safeDiscount,
      taxableAmount,
      gstAmount,
      total
    });

    const key = `invoices/${new Date().getFullYear()}/${invoiceNumber}.pdf`;
    await uploadPdf(key, pdfBuffer);
    await conn.query('UPDATE invoices SET pdf_key=? WHERE id=?', [key, invoiceId]);
    await conn.commit();

    totals = { subtotal, discount: safeDiscount, taxableAmount, gstAmount, total, pdf_key: key };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }

  let emailStatus = 'SKIPPED';
  let emailError = null;
  if (email_invoice && customer.email) {
    try {
      await sendInvoiceEmail({
        to: customer.email,
        invoiceNumber,
        customerName: customer.name,
        pdfBuffer
      });
      emailStatus = 'SENT';
      await pool.query('UPDATE invoices SET email_status=? WHERE id=?', ['SENT', invoiceId]);
    } catch (e) {
      emailStatus = 'FAILED';
      emailError = e.message;
      await pool.query('UPDATE invoices SET email_status=? WHERE id=?', ['FAILED', invoiceId]);
    }
  }

  const downloadUrl = await createDownloadUrl(totals.pdf_key);
  res.status(201).json({
    success: true,
    id: invoiceId,
    invoice_number: invoiceNumber,
    ...totals,
    email_status: emailStatus,
    email_error: emailError,
    download_url: downloadUrl
  });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Cloud Invoice Billing running on port ${port}`));
