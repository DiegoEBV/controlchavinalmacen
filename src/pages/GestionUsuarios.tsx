import React, { useEffect, useState } from 'react';
import { Container, Table, Button, Form, Alert, Badge, Modal, Spinner } from 'react-bootstrap';
import { FaEye, FaEyeSlash, FaKey, FaBuilding, FaMagic, FaClipboard, FaPencilAlt, FaCheck, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
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

    // Estado de Cambio de Contraseña
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordResetUserId, setPasswordResetUserId] = useState<string | null>(null);
    const [newPasswordReset, setNewPasswordReset] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

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

    const handleOpenPasswordModal = (userProfile: UserProfile) => {
        setPasswordResetUserId(userProfile.id);
        setNewPasswordReset('');
        setShowPasswordModal(true);
        setShowPassword(false);
    };

    const generatePassword = () => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        const length = 12;
        let pwd = "";
        for (let i = 0; i < length; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setNewPasswordReset(pwd);
        setShowPassword(true); // Mostrar para que el admin la pueda copiar
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(newPasswordReset);
        // Opcional: Mostrar un toast o alerta pequeña
    };

    const handlePasswordReset = async () => {
        if (!passwordResetUserId) return;
        if (newPasswordReset.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            setTimeout(() => setError(null), 3000);
            return;
        }

        setResetLoading(true);
        try {
            const { error } = await supabase.rpc('admin_update_user_password', {
                target_user_id: passwordResetUserId,
                new_password: newPasswordReset
            });

            if (error) throw error;

            setSuccessMessage('Contraseña actualizada correctamente.');
            setShowPasswordModal(false);
            setNewPasswordReset('');
            setPasswordResetUserId(null);
        } catch (error: any) {
            console.error('Error resetting password:', error);
            setError(error.message || 'Error al actualizar la contraseña.');
        } finally {
            setResetLoading(false);
            setTimeout(() => setSuccessMessage(null), 5000);
            setTimeout(() => setError(null), 5000);
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

            <div className="table-responsive shadow-sm rounded-3 overflow-hidden">
                <Table hover className="align-middle mb-0 bg-white">
                    <thead className="bg-light">
                        <tr>
                            <th className="py-3 ps-4 text-secondary text-uppercase x-small opacity-75 border-0">Nombre</th>
                            <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0">Email</th>
                            <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0 text-center">Rol Actual</th>
                            <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0">Asignar Rol</th>
                            <th className="py-3 text-secondary text-uppercase x-small opacity-75 border-0 text-center">Acciones</th>
                            <th className="py-3 pe-4 text-end text-secondary text-uppercase x-small opacity-75 border-0">Fecha Registro</th>
                        </tr>
                    </thead>
                    <tbody className="border-top-0">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-5 text-muted">
                                    <Spinner animation="border" size="sm" className="me-2" /> Cargando usuarios...
                                </td>
                            </tr>
                        ) : profiles.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-5 text-muted">
                                    <div className="mb-2">👥</div>
                                    No se encontraron usuarios.
                                </td>
                            </tr>
                        ) : (
                            profiles.map((profile) => (
                                <tr key={profile.id} className="border-bottom">
                                    <td className="ps-4 py-3">
                                        {editingUserId === profile.id ? (
                                            <div className="d-flex gap-2">
                                                <Form.Control
                                                    size="sm"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="form-control-sm"
                                                />
                                                <Button size="sm" variant="success" className="rounded-circle shadow-sm" style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => saveName(profile.id)}>
                                                    <FaCheck />
                                                </Button>
                                                <Button size="sm" variant="danger" className="rounded-circle shadow-sm" style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={cancelEditing}>
                                                    <FaTimes />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="d-flex align-items-center">
                                                <div className="fw-bold text-dark me-2">{profile.nombre || 'Sin nombre'}</div>
                                                <Button size="sm" variant="link" className="p-0 text-muted opacity-50 hover-opacity-100 text-decoration-none" onClick={() => startEditing(profile)} title="Editar nombre">
                                                    <FaPencilAlt className="small" />
                                                </Button>
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-3 text-muted small">{profile.email}</td>
                                    <td className="py-3 text-center">
                                        <Badge bg={getRoleBadgeColor(profile.role)} className="rounded-pill px-3 fw-normal">
                                            {profile.role.toUpperCase()}
                                        </Badge>
                                    </td>
                                    <td className="py-3">
                                        <Form.Select
                                            size="sm"
                                            value={profile.role}
                                            onChange={(e) => handleRoleChange(profile.id, e.target.value as UserRole)}
                                            style={{ maxWidth: '160px', fontSize: '0.85rem' }}
                                            disabled={profile.id === user?.id}
                                            className="border-secondary border-opacity-25"
                                        >
                                            {ROLES.map(role => (
                                                <option key={role} value={role}>
                                                    {role.toUpperCase()}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </td>
                                    <td className="py-3 text-center">
                                        <div className="d-flex justify-content-center gap-2">
                                            <Button
                                                variant="outline-primary"
                                                size="sm"
                                                className="d-flex align-items-center px-3"
                                                onClick={() => handleOpenObraModal(profile)}
                                                title="Gestionar Obras"
                                            >
                                                <FaBuilding className="me-2" /> Obras
                                            </Button>
                                            <Button
                                                variant="outline-danger"
                                                size="sm"
                                                className="d-flex align-items-center px-3"
                                                onClick={() => handleOpenPasswordModal(profile)}
                                                title="Cambiar Contraseña"
                                            >
                                                <FaKey className="me-2" /> Clave
                                            </Button>
                                        </div>
                                    </td>
                                    <td className="pe-4 py-3 text-end text-muted small">
                                        {new Date(profile.created_at).toLocaleDateString()}
                                    </td>
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

            {/* Password Reset Modal */}
            <Modal show={showPasswordModal} onHide={() => setShowPasswordModal(false)} backdrop="static" keyboard={false}>
                <Modal.Header closeButton>
                    <Modal.Title>Cambiar Contraseña</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Alert variant="danger">
                        <FaExclamationTriangle className="me-2" />
                        <strong>Advertencia:</strong> Esta acción cerrará la sesión actual del usuario en todos sus dispositivos.
                    </Alert>

                    <Form.Group className="mb-3">
                        <Form.Label>Nueva Contraseña</Form.Label>
                        <div className="input-group">
                            <Form.Control
                                type={showPassword ? "text" : "password"}
                                placeholder="Mínimo 8 caracteres"
                                value={newPasswordReset}
                                onChange={(e) => setNewPasswordReset(e.target.value)}
                                minLength={8}
                            />
                            <Button variant="outline-secondary" onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Ocultar" : "Mostrar"}>
                                {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </Button>
                        </div>
                        <Form.Text className="text-muted">
                            La contraseña debe tener al menos 8 caracteres.
                        </Form.Text>
                    </Form.Group>

                    <div className="d-flex gap-2 mb-3">
                        <Button variant="outline-primary" size="sm" onClick={generatePassword}>
                            <FaMagic className="me-1" /> Generar Aleatoria
                        </Button>
                        <Button variant="outline-secondary" size="sm" onClick={copyToClipboard} disabled={!newPasswordReset}>
                            <FaClipboard className="me-1" /> Copiar
                        </Button>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowPasswordModal(false)}>
                        Cancelar
                    </Button>
                    <Button variant="danger" onClick={handlePasswordReset} disabled={resetLoading || newPasswordReset.length < 8}>
                        {resetLoading ? (
                            <>
                                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                                Cambiando...
                            </>
                        ) : (
                            'Cambiar Contraseña'
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default GestionUsuarios;
