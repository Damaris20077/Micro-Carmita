-- SOLO en un servidor de ensayo aislado y dentro de la base de ensayo ya vacía.
-- No crea bases, cuentas ni modifica micro_carmita. No contiene datos personales.
CREATE TABLE backup_probe (
    id INT PRIMARY KEY,
    etiqueta VARCHAR(80) NOT NULL,
    importe DECIMAL(10,2) NOT NULL,
    CONSTRAINT chk_backup_probe_importe CHECK (importe >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO backup_probe (id,etiqueta,importe) VALUES
    (1,'Ensayo de recuperación',1.25),(2,'Datos ficticios',2.75);
