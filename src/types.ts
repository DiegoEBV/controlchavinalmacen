export interface DetalleRequerimiento {
    id: string;
    requerimiento_id: string;
    tipo: 'Material' | 'Servicio';
    material_categoria: string;
    descripcion: string;
    unidad: string;
    cantidad_solicitada: number;
    cantidad_atendida: number;
    atencion_por?: string;
    fecha_atencion?: string;
    numero_solicitud_compra?: string;
    orden_compra?: string;
    proveedor?: string;
    estado: 'Pendiente' | 'Parcial' | 'Atendido' | 'Cancelado';
    observaciones?: string;
    created_at?: string;
}

export interface Requerimiento {
    id: string;
    obra_id?: string; // Optional if we just hardcode one for now, but good to have
    item_correlativo: number;
    bloque: string;
    especialidad: string;
    solicitante: string;
    fecha_solicitud: string;
    created_at: string;

    // Virtual field for UI
    detalles?: DetalleRequerimiento[];
}

export interface Obra {
    id: string;
    nombre_obra: string;
}

export interface Material {
    id: string;
    categoria: string;
    descripcion: string;
    unidad: string;
    stock_maximo: number;
    created_at?: string;
}

export interface Inventario {
    id: string;
    material_id: string;
    material?: Material; // Joined
    cantidad_actual: number;
    ultimo_ingreso?: string;
    updated_at: string;
}

export interface MovimientoAlmacen {
    id: string;
    tipo: 'ENTRADA' | 'SALIDA';
    material_id: string;
    cantidad: number;
    fecha: string;
    documento_referencia?: string;
    requerimiento_id?: string;
    destino_o_uso?: string;
    created_at: string;
}

export interface SolicitudCompra {
    id: string;
    requerimiento_id: string;
    requerimiento?: Requerimiento;
    numero_sc: string;
    fecha_sc: string;
    estado: 'Pendiente' | 'Aprobada' | 'Anulada' | 'Atendida';
    created_at: string;
    detalles?: DetalleSC[];
}

export interface DetalleSC {
    id: string;
    sc_id: string;
    material_id: string;
    material?: Material;
    cantidad: number;
    unidad: string;
    estado: 'Pendiente' | 'En Orden';
    created_at: string;
}

export interface OrdenCompra {
    id: string;
    numero_oc: string;
    proveedor: string;
    fecha_oc: string;
    estado: 'Emitida' | 'Anulada' | 'Recepcionada';
    sc_id?: string;
    fecha_aproximada_atencion?: string;
    created_at: string;
    detalles?: DetalleOC[];
}

export interface DetalleOC {
    id: string;
    oc_id: string;
    detalle_sc_id: string;
    detalle_sc?: DetalleSC; // Joined
    cantidad: number;
    precio_unitario?: number;
    created_at: string;
}
