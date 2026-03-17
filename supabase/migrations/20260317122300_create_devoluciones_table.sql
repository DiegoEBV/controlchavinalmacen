CREATE TABLE IF NOT EXISTS public.devoluciones (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL,
  fecha TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  
  -- Item that exited
  material_salida_id UUID NULL,
  equipo_salida_id UUID NULL,
  epp_salida_id UUID NULL,
  tipo_salida TEXT NOT NULL CHECK (tipo_salida IN ('MATERIAL', 'EQUIPO', 'EPP')),
  cantidad_salida NUMERIC NOT NULL CHECK (cantidad_salida > 0),
  
  motivo TEXT NOT NULL,
  es_cambio BOOLEAN NOT NULL DEFAULT false,
  
  -- Item that entered (if exchange)
  material_entrada_id UUID NULL,
  equipo_entrada_id UUID NULL,
  epp_entrada_id UUID NULL,
  tipo_entrada TEXT NULL CHECK (tipo_entrada IN ('MATERIAL', 'EQUIPO', 'EPP')),
  cantidad_entrada NUMERIC NULL CHECK (cantidad_entrada > 0),
  
  id_salida_ref TEXT NULL, -- Vale de salida
  id_entrada_ref TEXT NULL, -- Vintar code
  
  usuario_id UUID NOT NULL,
  
  CONSTRAINT devoluciones_pkey PRIMARY KEY (id),
  CONSTRAINT devoluciones_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras (id),
  CONSTRAINT devoluciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles (id),
  
  CONSTRAINT devoluciones_material_salida_id_fkey FOREIGN KEY (material_salida_id) REFERENCES materiales (id),
  CONSTRAINT devoluciones_equipo_salida_id_fkey FOREIGN KEY (equipo_salida_id) REFERENCES equipos (id),
  CONSTRAINT devoluciones_epp_salida_id_fkey FOREIGN KEY (epp_salida_id) REFERENCES epps_c (id),
  
  CONSTRAINT devoluciones_material_entrada_id_fkey FOREIGN KEY (material_entrada_id) REFERENCES materiales (id),
  CONSTRAINT devoluciones_equipo_entrada_id_fkey FOREIGN KEY (equipo_entrada_id) REFERENCES equipos (id),
  CONSTRAINT devoluciones_epp_entrada_id_fkey FOREIGN KEY (epp_entrada_id) REFERENCES epps_c (id),
  
  CONSTRAINT check_single_item_salida_type CHECK (
    (
      (
        CASE WHEN material_salida_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN equipo_salida_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN epp_salida_id IS NOT NULL THEN 1 ELSE 0 END
      ) = 1
    )
  ),
  
  CONSTRAINT check_single_item_entrada_type CHECK (
    (es_cambio = false) OR
    (es_cambio = true AND (
      (
        CASE WHEN material_entrada_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN equipo_entrada_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN epp_entrada_id IS NOT NULL THEN 1 ELSE 0 END
      ) = 1
    ))
  )
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_obra_id ON public.devoluciones(obra_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_fecha ON public.devoluciones(fecha);

ALTER TABLE public.devoluciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to devoluciones" 
ON public.devoluciones 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
