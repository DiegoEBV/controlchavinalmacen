export interface Frente {
    id: string;
    obra_id: string;
    nombre_frente: string;
    created_at?: string;
}

export interface Bloque {
    id: string;
    frente_id: string;
    nombre_bloque: string;
    created_at?: string;
}

export interface DetalleRequerimiento {
    id: string;
    requerimiento_id: string;
    tipo: 'Material' | 'Servicio' | 'Equipo' | 'EPP';
    material_categoria: string;
    descripcion: string;
    unidad: string;
    cantidad_solicitada: number;
    equipo_id?: string; // Nuevo campo referencial
    equipo?: Equipo; // Unión
    epp_id?: string;
    epp?: EppC;
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
    obra_id?: string;
    frente_id?: string; // Nuevo campo
    frente?: Frente;   // Unión
    item_correlativo: number;
    bloque: string;
    especialidad: string;
    specialty_id?: string; // Nuevo campo
    specialty?: Specialty; // Unión
    solicitante: string;
    fecha_solicitud: string;
    created_at: string;

    // Campo virtual para UI
    detalles?: DetalleRequerimiento[];
}

export interface Obra {
    id: string;
    nombre_obra: string;
    ubicacion?: string;
    formato_requerimiento_url?: string;
    formato_solicitud_url?: string;
}

export interface Material {
    id: string;
    frente_id?: string; // Nuevo campo
    frente?: Frente;    // Unión
    categoria: string;
    descripcion: string;
    unidad: string;
    stock_maximo: number;
    informacion_adicional?: string;
    specialty_id?: string;
    specialty?: Specialty;
    created_at?: string;
}

export interface Inventario {
    id: string;
    obra_id: string;
    material_id: string;
    material?: Material; // Unido
    cantidad_actual: number;
    ultimo_ingreso?: string;
    updated_at: string;
}

export interface MovimientoAlmacen {
    id: string;
    obra_id: string;
    tipo: 'ENTRADA' | 'SALIDA';
    material_id: string;
    cantidad: number;
    fecha: string;
    documento_referencia?: string;
    requerimiento_id?: string;
    vintar_code?: string; // Nuevo campo
    destino_o_uso?: string;
    solicitante?: string;
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
    comentario?: string;
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
    detalle_sc?: DetalleSC; // Unido
    cantidad: number;
    precio_unitario?: number;
    created_at: string;
}

export interface Equipo {
    id: string;
    obra_id: string;
    nombre: string;
    codigo: string;
    marca: string;
    cantidad: number;
    created_at?: string;
}

export interface EppC {
    id: string;
    codigo?: string;
    descripcion: string;
    unidad: string;
    tipo: 'Personal' | 'Colectivo';
    stock_actual: number;
    activo: boolean;
    created_at?: string;
}

export interface Specialty {
    id: string;
    name: string;
    description?: string;
    active: boolean;
    created_at?: string;
}

export interface FrontSpecialty {
    id: string;
    front_id: string;
    specialty_id: string;
    specialty?: Specialty;
    created_at?: string;
}

export interface Tercero {
    id: string;
    obra_id: string;
    nombre_completo: string;
    ruc?: string;
    dni?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    created_at: string;
}
