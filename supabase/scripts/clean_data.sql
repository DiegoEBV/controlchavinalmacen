-- ⚠️ PRECAUCIÓN: Este script borrará TODOS los datos de las tablas transaccionales.
-- Úsalo solo en desarrollo o si estás seguro de querer reiniciar la base de datos.

-- 1. Movimientos de Almacén y Stock
TRUNCATE TABLE movimientos_almacen CASCADE;
TRUNCATE TABLE inventario_obra CASCADE;

-- 2. Órdenes de Compra y sus detalles
TRUNCATE TABLE detalles_oc CASCADE;
TRUNCATE TABLE ordenes_compra CASCADE;

-- 3. Solicitudes de Compra y sus detalles
TRUNCATE TABLE detalles_sc CASCADE;
TRUNCATE TABLE solicitudes_compra CASCADE;

-- 4. Requerimientos y sus detalles
TRUNCATE TABLE detalles_requerimiento CASCADE;
TRUNCATE TABLE requerimientos CASCADE;

-- Nota: No se borran 'materiales', 'obras' ni 'perfiles' (usuarios).
