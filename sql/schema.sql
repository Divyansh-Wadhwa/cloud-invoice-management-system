CREATE DATABASE IF NOT EXISTS invoice_db;
USE invoice_db;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(150),
  address TEXT,
  gstin VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  unit VARCHAR(30) DEFAULT 'pcs',
  price DECIMAL(10,2) NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  discount DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  pdf_key VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(150) NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

INSERT INTO products (name, unit, price, gst_rate) VALUES
('Bread 400g','pcs',35,5),
('Milk Bun','pcs',30,5),
('Rusk','pack',50,5),
('Biscuits','pack',40,5),
('Cake','pcs',250,5)
ON DUPLICATE KEY UPDATE name=name;
