-- Agregar campos faltantes a la tabla users
ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
ALTER TABLE users ADD COLUMN dni VARCHAR(20);
ALTER TABLE users ADD COLUMN postal_code VARCHAR(10);
ALTER TABLE users ADD COLUMN city VARCHAR(100);
ALTER TABLE users ADD COLUMN province VARCHAR(100);