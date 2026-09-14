CREATE DATABASE IF NOT EXISTS invoice_db;
USE invoice_db;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(190),
  address TEXT,
  gstin VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer_name (name),
  INDEX idx_customer_phone (phone)
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barcode VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(255),
  unit VARCHAR(30) DEFAULT 'pcs',
  selling_price DECIMAL(12,2) NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 0,
  hsn_code VARCHAR(30),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_name (name),
  INDEX idx_product_active (active)
);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(60) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_email VARCHAR(190),
  customer_phone VARCHAR(30),
  customer_address TEXT,
  customer_gstin VARCHAR(20),
  subtotal DECIMAL(14,2) NOT NULL,
  discount DECIMAL(14,2) DEFAULT 0,
  taxable_amount DECIMAL(14,2) NOT NULL,
  gst_amount DECIMAL(14,2) DEFAULT 0,
  total DECIMAL(14,2) NOT NULL,
  pdf_key VARCHAR(500),
  email_status VARCHAR(30) DEFAULT 'PENDING',
  payment_status VARCHAR(30) DEFAULT 'UNPAID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  INDEX idx_invoice_customer (customer_id),
  INDEX idx_invoice_created (created_at)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT NOT NULL,
  product_id INT,
  barcode VARCHAR(64),
  product_name VARCHAR(150) NOT NULL,
  unit VARCHAR(30),
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 0,
  gst_amount DECIMAL(14,2) DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  INDEX idx_invoice_item_invoice (invoice_id)
);

-- Example product; replace/edit from the Products screen.
INSERT INTO products (barcode, name, unit, selling_price, gst_rate)
VALUES ('8901063016743', 'Demo Bakery Product', 'pcs', 35.00, 5.00)
ON DUPLICATE KEY UPDATE barcode = barcode;
