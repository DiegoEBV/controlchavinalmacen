import React, { useEffect, useState } from 'react';
import { Container, Table, Button, Form, Alert, Badge, Modal } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../types/auth';
import { useAuth } from '../context/AuthContext';
import { Obra } from '../types';



const GestionUsuarios = () => {
    const { user } = useAuth();
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Estado del Modal
    const [showModal, setShowModal] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserRole, setNewUserRole] = useState<UserRole>('sin_asignar');
    const [creatingUser, setCreatingUser] = useState(false);

    // Estado de Edición
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Estado de Asignación de Obra
    const [showObraModal, setShowObraModal] = useState(false);
    const [selectedUserForObras, setSelectedUserForObras] = useState<UserProfile | null>(null);
    const [allObras, setAllObras] = useState<Obra[]>([]);
    const [userObras, setUserObras] = useState<string[]>([]); // Array of obra_ids
    const [savingObras, setSavingObras] = useState(false);

    const ROLES: UserRole[] = ['admin', 'produccion', 'coordinador', 'logistica', 'almacenero', 'sin_asignar'];

    useEffect(() => {
        fetchProfiles();
        fetchObras();
    }, []);

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProfiles(data as UserProfile[]);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchObras = async () => {
        const { data } = await supabase.from('obras').select('*').order('nombre_obra');
        setAllObras(data || []);
    };

    const handleOpenObraModal = async (userProfile: UserProfile) => {
        setSelectedUserForObras(userProfile);
        setShowObraModal(true);
        setSavingObras(true); // Mostrar estado de carga mientras se obtiene
        // Obtener asignaciones actuales
        const { data } = await supabase
            .from('usuario_obras')
            .select('obra_id')
            .eq('user_id', userProfile.id);

        setUserObras(data ? data.map(d => d.obra_id) : []);
        setSavingObras(false);
    };

    const handleSaveObras = async () => {
        if (!selectedUserForObras) return;
        setSavingObras(true);
        try {
            // Eliminar existentes
            await supabase.from('usuario_obras').delete().eq('user_id', selectedUserForObras.id);

            // Insertar nuevas
            if (userObras.length > 0) {
                const inserts = userObras.map(obraId => ({
                    user_id: selectedUserForObras.id,
                    obra_id: obraId
                }));
                const { error } = await supabase.from('usuario_obras').insert(inserts);
                if (error) throw error;
            }

            setSuccessMessage(`Obras asignadas a ${selectedUserForObras.nombre} correctamente.`);
            setShowObraModal(false);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setSavingObras(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const toggleObraSelection = (obraId: string) => {
        if (userObras.includes(obraId)) {
            setUserObras(userObras.filter(id => id !== obraId));
        } else {
            setUserObras([...userObras, obraId]);
        }
    };

    const handleRoleChange = async (userId: string, newRole: UserRole) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;

            setProfiles(profiles.map(p => p.id === userId ? { ...p, role: newRole } : p));
            setSuccessMessage('Rol actualizado correctamente');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error: any) {
            setError(error.message);
            setTimeout(() => setError(null), 3000);
        }
    };

    const startEditing = (profile: UserProfile) => {
        setEditingUserId(profile.id);
        setEditName(profile.nombre || '');
    };

    const cancelEditing = () => {
        setEditingUserId(null);
        setEditName('');
    };

    const saveName = async (userId: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ nombre: editName })
                .eq('id', userId);

            if (error) throw error;

            setProfiles(profiles.map(p => p.id === userId ? { ...p, nombre: editName } : p));
            setEditingUserId(null);
            setSuccessMessage('Nombre actualizado correctamente');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error: any) {
            setError(error.message);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreatingUser(true);
        setError(null);

        try {
            // Crear un cliente temporal para evitar cerrar sesión del administrador
            const tempClient = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false, // No guardar sesión en almacenamiento local
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

            // 1. Registrar al usuario
            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: newUserEmail,
                password: newUserPassword,
                options: {
                    data: {
                        full_name: newUserName
                    }
                }
            });

            if (authError) throw authError;

            if (authData.user) {
                // 2. Actualizar el rol inmediatamente usando el cliente ADMIN (instancia principal de supabase)
                // El trigger crea el perfil con 'sin_asignar', lo actualizamos aquí.
                // Podríamos necesitar un pequeño retraso o reintento si el trigger es lento, pero usualmente es instantáneo.

                // Esperar un momento para que el trigger se dispare (opcional pero más seguro)
                await new Promise(resolve => setTimeout(resolve, 1000));

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ role: newUserRole })
                    .eq('id', authData.user.id);

                if (updateError) {
                    console.warn('Error updating role for new user:', updateError);
                    // No lanzamos error aquí, permitiendo que la creación del usuario cuente como éxito, pero advertimos sobre el rol
                    setSuccessMessage('Usuario creado, pero hubo un error actualizando el rol. Verifica la lista.');
                } else {
                    setSuccessMessage(`Usuario ${newUserName} creado correctamente.`);
                }

                // Reiniciar formulario y refrescar lista
                setShowModal(false);
                setNewUserEmail('');
                setNewUserPassword('');
                setNewUserName('');
                setNewUserRole('sin_asignar');
                fetchProfiles();
            }

        } catch (error: any) {
            setError(error.message || 'Error al crear usuario');
        } finally {
            setCreatingUser(false);
            // Limpiar mensaje de éxito después de un retraso
            setTimeout(() => setSuccessMessage(null), 5000);
        }
    };

    const getRoleBadgeColor = (role: UserRole) => {
        switch (role) {
            case 'admin': return 'danger';
            case 'produccion': return 'primary';
            case 'coordinador': return 'info';
            case 'logistica': return 'warning';
            case 'almacenero': return 'secondary';
            case 'sin_asignar': return 'dark';
            default: return 'light';
        }
    };

    return (
        <Container className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2>Gestión de Usuarios</h2>
                <Button variant="success" onClick={() => setShowModal(true)}>
                    + Nuevo Usuario
                </Button>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <div className="table-responsive shadow-sm">
                <Table hover className="align-middle bg-white">
                    <thead className="bg-light">
                        <tr>
                            <th>Nombre</th>
                            <th>Email</th>
                            <th>Rol Actual</th>
                            <th>Asignar Rol</th>
                            <th>Obras</th>
                            <th>Fecha Registro</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="text-center py-4">Cargando usuarios...</td>
                            </tr>
                        ) : profiles.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-4">No se encontraron usuarios.</td>
                            </tr>
                        ) : (
                            profiles.map((profile) => (
                                <tr key={profile.id}>
                                    <td>
                                        {editingUserId === profile.id ? (
                                            <div className="d-flex gap-2">
                                                <Form.Control
                                                    size="sm"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                />
                                                <Button size="sm" variant="success" onClick={() => saveName(profile.id)}>✓</Button>
                                                <Button size="sm" variant="secondary" onClick={cancelEditing}>✕</Button>
                                            </div>
                                        ) : (
                                            <div className="d-flex align-items-center justify-content-between">
                                                <span>{profile.nombre || 'Sin nombre'}</span>
                                                <Button size="sm" variant="link" className="p-0 ms-2 text-decoration-none" onClick={() => startEditing(profile)}>✏️</Button>
                                            </div>
                                        )}
                                    </td>
                                    <td>{profile.email}</td>
                                    <td>
                                        <Badge bg={getRoleBadgeColor(profile.role)}>
                                            {profile.role.toUpperCase()}
                                        </Badge>
                                    </td>
                                    <td>
                                        <Form.Select
                                            size="sm"
                                            value={profile.role}
                                            onChange={(e) => handleRoleChange(profile.id, e.target.value as UserRole)}
                                            style={{ maxWidth: '150px' }}
                                            disabled={profile.id === user?.id}
                                        >
                                            {ROLES.map(role => (
                                                <option key={role} value={role}>
                                                    {role.toUpperCase()}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </td>
                                    <td>
                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() => handleOpenObraModal(profile)}
                                        >
                                            Gestionar Obras
                                        </Button>
                                    </td>
                                    <td>{new Date(profile.created_at).toLocaleDateString()}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </div>

            {/* Create User Modal */}
            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Crear Nuevo Usuario</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCreateUser}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre Completo</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Juan Perez"
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Correo Electrónico</Form.Label>
                            <Form.Control
                                type="email"
                                placeholder="nombre@ejemplo.com"
                                value={newUserEmail}
                                onChange={(e) => setNewUserEmail(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Contraseña</Form.Label>
                            <Form.Control
                                type="password"
                                placeholder="Mínimo 6 caracteres"
                                value={newUserPassword}
                                onChange={(e) => setNewUserPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Rol Inicial</Form.Label>
                            <Form.Select
                                value={newUserRole}
                                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                            >
                                {ROLES.map(role => (
                                    <option key={role} value={role}>
                                        {role.toUpperCase()}
                                    </option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>
                            Cancelar
                        </Button>
                        <Button variant="primary" type="submit" disabled={creatingUser}>
                            {creatingUser ? 'Creando...' : 'Crear Usuario'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Obra Assignment Modal */}
            <Modal show={showObraModal} onHide={() => setShowObraModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Asignar Obras a {selectedUserForObras?.nombre}</Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {savingObras && userObras.length === 0 ? (
                        <div className="text-center">Cargando asignaciones...</div>
                    ) : (
                        <Form>
                            {allObras.map(obra => (
                                <Form.Check
                                    key={obra.id}
                                    type="checkbox"
                                    id={`obra-${obra.id}`}
                                    label={
                                        <span>
                                            <strong>{obra.nombre_obra}</strong>
                                            <br />
                                            <small className="text-muted">{obra.ubicacion}</small>
                                        </span>
                                    }
                                    checked={userObras.includes(obra.id)}
                                    onChange={() => toggleObraSelection(obra.id)}
                                    className="mb-3"
                                />
                            ))}
                        </Form>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowObraModal(false)}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={handleSaveObras} disabled={savingObras}>
                        {savingObras ? 'Guardando...' : 'Guardar Cambios'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default GestionUsuarios;
