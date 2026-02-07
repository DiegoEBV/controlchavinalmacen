export type UserRole = 'admin' | 'produccion' | 'coordinador' | 'logistica' | 'almacenero' | 'sin_asignar';

export interface UserProfile {
    id: string;
    email: string;
    role: UserRole;
    nombre: string;
    created_at: string;
}
