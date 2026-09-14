# Cloud-Based Wholesale Billing & Invoice Management System

A professional mobile-friendly billing application for a wholesale shop.

## Workflow

Shopkeeper registers products with barcode, price, GST and unit.

Customer accounts store name, phone, email, address and GSTIN.

During billing:
1. Select customer.
2. Open phone camera barcode scanner.
3. Scan a product.
4. Product popup shows standard selling price.
5. Cashier can override the selling price and choose quantity.
6. Repeat for every product.
7. Review subtotal, discount, taxable amount, GST and total.
8. Generate invoice.
9. PDF is stored privately in Amazon S3.
10. Invoice history is stored in RDS/MySQL.
11. Customer receives the invoice by email through Amazon SES.

## AWS

- EC2: application hosting
- Docker: containerization
- RDS MySQL: customers/products/invoices
- S3: private PDF storage
- SES: invoice email
- GitHub Actions: deployment

## Setup

1. Run `sql/schema.sql` against RDS.
2. Create `.env` from `.env.example`.
3. Build Docker image.
4. Run on port 80.
5. For phone camera scanning, expose the app over HTTPS.
6. Verify the SES sender identity before enabling customer emails.

## Barcode

The database uses the barcode as a unique product identifier. A barcode itself is not assumed to contain the selling price; the backend looks up the current registered product price.
