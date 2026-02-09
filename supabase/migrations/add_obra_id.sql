-- Add obra_id to inventario_obra
ALTER TABLE inventario_obra 
ADD COLUMN obra_id UUID REFERENCES obras(id);

-- Add obra_id to movimientos_almacen
ALTER TABLE movimientos_almacen 
ADD COLUMN obra_id UUID REFERENCES obras(id);

-- Optional: Index on obra_id for performance
CREATE INDEX idx_inventario_obra_id ON inventario_obra(obra_id);
CREATE INDEX idx_movimientos_obra_id ON movimientos_almacen(obra_id);
