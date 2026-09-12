import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './db.js';
import { uploadPdf, createDownloadUrl } from './s3.js';
import { buildInvoicePdf } from './pdf.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.get('/api/customers', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM customers ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/customers', async (req, res) => {
  const { name, phone, email, address, gstin } = req.body;
  if (!name) return res.status(400).json({ error: 'Customer name is required' });
  const [r] = await pool.query('INSERT INTO customers(name,phone,email,address,gstin) VALUES(?,?,?,?,?)', [name, phone, email, address, gstin]);
  res.status(201).json({ id: r.insertId, name, phone, email, address, gstin });
});

app.get('/api/products', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM products ORDER BY name');
  res.json(rows);
});

app.post('/api/products', async (req, res) => {
  const { name, unit = 'pcs', price, gst_rate = 0 } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'name and price are required' });
  const [r] = await pool.query('INSERT INTO products(name,unit,price,gst_rate) VALUES(?,?,?,?)', [name, unit, price, gst_rate]);
  res.status(201).json({ id: r.insertId });
});

app.get('/api/invoices', async (_req, res) => {
  const [rows] = await pool.query(`SELECT i.id,i.invoice_number,i.subtotal,i.discount,i.tax,i.total,i.created_at,c.name customer_name
    FROM invoices i JOIN customers c ON c.id=i.customer_id ORDER BY i.id DESC`);
  res.json(rows);
});

app.get('/api/invoices/:id/download', async (req, res) => {
  const [rows] = await pool.query('SELECT pdf_key FROM invoices WHERE id=?', [req.params.id]);
  if (!rows.length || !rows[0].pdf_key) return res.status(404).json({ error: 'Invoice PDF not found' });
  res.json({ url: await createDownloadUrl(rows[0].pdf_key) });
});

app.post('/api/invoices', async (req, res) => {
  const { customer_id, items, discount = 0 } = req.body;
  if (!customer_id || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'customer_id and items are required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[customer]] = await conn.query('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!customer) throw new Error('Customer not found');

    const normalized = [];
    let subtotal = 0;
    let tax = 0;
    for (const line of items) {
      const [[p]] = await conn.query('SELECT * FROM products WHERE id=?', [line.product_id]);
      if (!p) throw new Error(`Product ${line.product_id} not found`);
      const quantity = Number(line.quantity);
      if (!(quantity > 0)) throw new Error(`Invalid quantity for ${p.name}`);
      const amount = quantity * Number(p.price);
      subtotal += amount;
      tax += (amount * Number(p.gst_rate || 0)) / 100;
      normalized.push({ product_id: p.id, product_name: p.name, quantity, unit_price: Number(p.price), gst_rate: Number(p.gst_rate || 0), amount });
    }

    const safeDiscount = Math.max(0, Number(discount));
    const total = subtotal - safeDiscount + tax;
    const invoiceNumber = `INV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Date.now().toString().slice(-6)}`;
    const [ir] = await conn.query('INSERT INTO invoices(invoice_number,customer_id,subtotal,discount,tax,total) VALUES(?,?,?,?,?,?)', [invoiceNumber, customer_id, subtotal, safeDiscount, tax, total]);
    const invoiceId = ir.insertId;

    for (const i of normalized) {
      await conn.query('INSERT INTO invoice_items(invoice_id,product_id,product_name,quantity,unit_price,gst_rate,amount) VALUES(?,?,?,?,?,?,?)', [invoiceId, i.product_id, i.product_name, i.quantity, i.unit_price, i.gst_rate, i.amount]);
    }

    const pdf = await buildInvoicePdf({ invoiceNumber, customer, items: normalized, subtotal, discount: safeDiscount, tax, total });
    const key = `invoices/${invoiceNumber}.pdf`;
    await uploadPdf(key, pdf);
    await conn.query('UPDATE invoices SET pdf_key=? WHERE id=?', [key, invoiceId]);
    await conn.commit();

    res.status(201).json({ id: invoiceId, invoice_number: invoiceNumber, subtotal, discount: safeDiscount, tax, total, pdf_key: key, download_url: await createDownloadUrl(key) });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally { conn.release(); }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Invoice API running on port ${port}`));
