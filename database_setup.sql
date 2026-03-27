-- Estructura de tablas
CREATE TABLE categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL);

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY, 
    name VARCHAR(100) NOT NULL, 
    color VARCHAR(30), 
    description TEXT, 
    price DECIMAL(10, 2) NOT NULL, 
    category_id INT, 
    image_url VARCHAR(255), 
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE product_sizes (
    id INT AUTO_INCREMENT PRIMARY KEY, 
    product_id INT, 
    size INT NOT NULL, 
    stock INT DEFAULT 0, 
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Datos de prueba
INSERT INTO categories (name) VALUES ('Urbanas'), ('Deportivas');
INSERT INTO products (name, color, description, price, category_id) VALUES ('Vans Old Skool', 'Negro/Blanco', 'Clásica', 85000, 1);
INSERT INTO product_sizes (product_id, size, stock) VALUES (1, 38, 5), (1, 40, 12);
