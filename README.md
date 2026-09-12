# Cloud-Based Invoice Management System

A cloud-ready Node.js/Express REST API for wholesale invoice management.

## Architecture

Browser → Node.js/Express API (Docker/EC2) → Amazon RDS MySQL
                                      ↘ Amazon S3 (private PDF invoices)

## Features
- Customer management
- Product/pricing management
- Invoice creation with GST and discount calculations
- PDF invoice generation
- Private S3 storage
- Presigned PDF download URLs
- Transactional MySQL writes
- Health endpoint
- Docker deployment
- GitHub Actions EC2 deployment
- Simple browser UI for demonstration

## Local setup
1. Copy `.env.example` to `.env` and fill values.
2. Run `npm install`.
3. Apply `sql/schema.sql` to MySQL.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## API
- `GET /api/health`
- `GET/POST /api/customers`
- `GET/POST /api/products`
- `GET /api/invoices`
- `POST /api/invoices`
- `GET /api/invoices/:id/download`

## AWS deployment
- EC2 runs the Docker container.
- RDS MySQL stores relational data.
- S3 bucket should remain private.
- EC2 should use an IAM role with only required S3 permissions.
- GitHub Actions uses repository secrets `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`.

Do not commit `.env`, AWS access keys, database passwords, or SSH private keys.
