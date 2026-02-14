import React, { useEffect, useState } from 'react';
import { Container, Table, Button, Form, Alert, Modal, Spinner } from 'react-bootstrap';
import { supabase } from '../config/supabaseClient';
import { Obra } from '../types';

const GestionObras = () => {
    const [obras, setObras] = useState<Obra[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Estado del Modal de Creación
    const [showModal, setShowModal] = useState(false);
    const [newObraName, setNewObraName] = useState('');
    const [newObraLocation, setNewObraLocation] = useState('');
    const [creating, setCreating] = useState(false);

    // Estado del Modal de Edición
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingObra, setEditingObra] = useState<Obra | null>(null);
    const [editObraName, setEditObraName] = useState('');
    const [editObraLocation, setEditObraLocation] = useState('');
    const [updating, setUpdating] = useState(false);

    // Estado para Archivos
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = [
        'application/pdf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const [reqFile, setReqFile] = useState<File | null>(null);
    const [solFile, setSolFile] = useState<File | null>(null);
    const [editReqFile, setEditReqFile] = useState<File | null>(null);
    const [editSolFile, setEditSolFile] = useState<File | null>(null);
    const [deletedReqUrl, setDeletedReqUrl] = useState<string | null>(null);
    const [deletedSolUrl, setDeletedSolUrl] = useState<string | null>(null);

    useEffect(() => {
        fetchObras();
    }, []);

    const fetchObras = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('obras')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setObras(data || []);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const validateFile = (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            return `El archivo ${file.name} excede el tamaño máximo de 10MB.`;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            return `El archivo ${file.name} no es un formato válido (PDF o Excel).`;
        }
        return null;
    };

    const deleteOldFile = async (url: string | undefined | null) => {
        if (!url) return;
        try {
            const path = url.split('/formatos-obras/')[1];
            if (path) {
                await supabase.storage.from('formatos-obras').remove([path]);
            }
        } catch (error) {
            console.error('Error deleting old file:', error);
        }
    };

    const handleCreateObra = async (e: React.FormEvent) => {
        e.preventDefault();

        if (reqFile) {
            const err = validateFile(reqFile);
            if (err) { setError(err); return; }
        }
        if (solFile) {
            const err = validateFile(solFile);
            if (err) { setError(err); return; }
        }

        setCreating(true);
        setError(null);

        try {
            // 1. Insertar Obra
            const { data: newObra, error: insertError } = await supabase
                .from('obras')
                .insert([
                    { nombre_obra: newObraName, ubicacion: newObraLocation }
                ])
                .select()
                .single();

            if (insertError) throw insertError;

            let reqUrl = null;
            let solUrl = null;
            let updateNeeded = false;

            // 2. Subir Archivos si existen
            if (reqFile) {
                const fileExt = reqFile.name.split('.').pop();
                const filePath = `${newObra.id}/requerimiento_${Date.now()}.${fileExt}`;
                const { error: upErr } = await supabase.storage.from('formatos-obras').upload(filePath, reqFile);
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('formatos-obras').getPublicUrl(filePath);
                reqUrl = publicUrl;
                updateNeeded = true;
            }
            if (solFile) {
                const fileExt = solFile.name.split('.').pop();
                const filePath = `${newObra.id}/solicitud_${Date.now()}.${fileExt}`;
                const { error: upErr } = await supabase.storage.from('formatos-obras').upload(filePath, solFile);
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('formatos-obras').getPublicUrl(filePath);
                solUrl = publicUrl;
                updateNeeded = true;
            }

            // 3. Actualizar Obra con URLs
            let finalObra = newObra;
            if (updateNeeded) {
                const { data: updatedObra, error: updateError } = await supabase
                    .from('obras')
                    .update({
                        formato_requerimiento_url: reqUrl,
                        formato_solicitud_url: solUrl
                    })
                    .eq('id', newObra.id)
                    .select()
                    .single();
                if (updateError) throw updateError;
                finalObra = updatedObra;
            }

            setObras([finalObra, ...obras]);
            setSuccessMessage(`Obra "${finalObra.nombre_obra}" creada correctamente.`);
            setShowModal(false);
            setNewObraName('');
            setNewObraLocation('');
            setReqFile(null);
            setSolFile(null);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setCreating(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleEditClick = (obra: Obra) => {
        setEditingObra(obra);
        setEditObraName(obra.nombre_obra);
        setEditObraLocation(obra.ubicacion || '');
        setEditReqFile(null);
        setEditSolFile(null);
        setDeletedReqUrl(null);
        setDeletedSolUrl(null);
        setShowEditModal(true);
    };

    const handleUpdateObra = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingObra) return;

        if (editReqFile) {
            const err = validateFile(editReqFile);
            if (err) { setError(err); return; }
        }
        if (editSolFile) {
            const err = validateFile(editSolFile);
            if (err) { setError(err); return; }
        }

        setUpdating(true);
        setError(null);

        try {
            let reqUrl: string | undefined | null = editingObra.formato_requerimiento_url;
            let solUrl: string | undefined | null = editingObra.formato_solicitud_url;

            // 1. Manejar Eliminación Explícita REQ
            if (deletedReqUrl && !editReqFile) {
                await deleteOldFile(deletedReqUrl);
                reqUrl = null; // Setear a null en la Base de Datos
            }
            // 2. Manejar Reemplazo REQ
            if (editReqFile) {
                // Si había uno anterior (URL actual o el marcado para borrar), se borra.
                // Nota: deleteOldFile maneja undefined/null sin error.
                await deleteOldFile(editingObra.formato_requerimiento_url);

                const fileExt = editReqFile.name.split('.').pop();
                const filePath = `${editingObra.id}/requerimiento_${Date.now()}.${fileExt}`;
                const { error: upErr } = await supabase.storage.from('formatos-obras').upload(filePath, editReqFile);
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('formatos-obras').getPublicUrl(filePath);
                reqUrl = publicUrl;
            }

            // 3. Manejar Eliminación Explícita SOL
            if (deletedSolUrl && !editSolFile) {
                await deleteOldFile(deletedSolUrl);
                solUrl = null;
            }
            // 4. Manejar Reemplazo SOL
            if (editSolFile) {
                await deleteOldFile(editingObra.formato_solicitud_url);

                const fileExt = editSolFile.name.split('.').pop();
                const filePath = `${editingObra.id}/solicitud_${Date.now()}.${fileExt}`;
                const { error: upErr } = await supabase.storage.from('formatos-obras').upload(filePath, editSolFile);
                if (upErr) throw upErr;
                const { data: { publicUrl } } = supabase.storage.from('formatos-obras').getPublicUrl(filePath);
                solUrl = publicUrl;
            }

            // Actualizar DB (puede que reqUrl/solUrl sean null ahora si se borraron)
            // Se debe permitir null en Update si los campos son NULLABLE (lo cual son)
            const updates: any = {
                nombre_obra: editObraName,
                ubicacion: editObraLocation,
                formato_requerimiento_url: reqUrl,
                formato_solicitud_url: solUrl
            };

            const { data, error } = await supabase
                .from('obras')
                .update(updates)
                .eq('id', editingObra.id)
                .select()
                .single();

            if (error) throw error;

            setObras(obras.map((obra) => (obra.id === editingObra.id ? data : obra)));
            setSuccessMessage(`Obra "${data.nombre_obra}" actualizada correctamente.`);
            setShowEditModal(false);
            setEditingObra(null);
            setEditReqFile(null);
            setEditSolFile(null);
            setDeletedReqUrl(null);
            setDeletedSolUrl(null);
        } catch (error: any) {
            setError(error.message);
        } finally {
            setUpdating(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    return (
        <Container className="mt-4">
            {/* ... (existing JSX) */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2>Gestión de Obras</h2>
                <Button variant="success" onClick={() => setShowModal(true)}>
                    + Nueva Obra
                </Button>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <div className="table-responsive shadow-sm">
                <Table hover className="align-middle bg-white">
                    <thead className="bg-light">
                        <tr>
                            <th>Nombre de Obra</th>
                            <th>Ubicación</th>
                            <th>ID</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="text-center py-4">
                                    <Spinner animation="border" size="sm" /> Cargando obras...
                                </td>
                            </tr>
                        ) : obras.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="text-center py-4">No hay obras registradas.</td>
                            </tr>
                        ) : (
                            obras.map((obra) => (
                                <tr key={obra.id}>
                                    <td className="fw-bold">{obra.nombre_obra}</td>
                                    <td>{obra.ubicacion || '-'}</td>
                                    <td className="text-muted small">{obra.id}</td>
                                    <td>
                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() => handleEditClick(obra)}
                                        >
                                            <i className="bi bi-pencil"></i> Editar
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </div>

            {/* Create Obra Modal - (Kept same) */}
            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Crear Nueva Obra</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCreateObra}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre de la Obra</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Residencial Los Pinos"
                                value={newObraName}
                                onChange={(e) => setNewObraName(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Ubicación</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Av. Principal 123"
                                value={newObraLocation}
                                onChange={(e) => setNewObraLocation(e.target.value)}
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Formato Requerimiento (PDF/Excel)</Form.Label>
                            <Form.Control
                                type="file"
                                accept=".pdf, .xls, .xlsx"
                                onChange={(e: any) => setReqFile(e.target.files ? e.target.files[0] : null)}
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Formato Solicitud (PDF/Excel)</Form.Label>
                            <Form.Control
                                type="file"
                                accept=".pdf, .xls, .xlsx"
                                onChange={(e: any) => setSolFile(e.target.files ? e.target.files[0] : null)}
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>
                            Cancelar
                        </Button>
                        <Button variant="primary" type="submit" disabled={creating}>
                            {creating ? 'Creando...' : 'Crear Obra'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Edit Obra Modal */}
            <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Editar Obra</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleUpdateObra}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre de la Obra</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Residencial Los Pinos"
                                value={editObraName}
                                onChange={(e) => setEditObraName(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Ubicación</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Ej. Av. Principal 123"
                                value={editObraLocation}
                                onChange={(e) => setEditObraLocation(e.target.value)}
                            />
                        </Form.Group>

                        {/* Edit Req File Section */}
                        <Form.Group className="mb-3">
                            <Form.Label>Formato Requerimiento</Form.Label>

                            {/* Mostrar archivo actual si existe y NO ha sido marcado para borrar */}
                            {editingObra?.formato_requerimiento_url && !deletedReqUrl && (
                                <div className="mb-2 d-flex align-items-center justify-content-between p-2 border rounded bg-light">
                                    <div>
                                        <small className="text-muted d-block">Archivo Actual:</small>
                                        <a href={editingObra.formato_requerimiento_url} target="_blank" rel="noopener noreferrer" className="text-decoration-none fw-bold">
                                            <i className="bi bi-file-earmark-text me-1"></i> Ver archivo
                                        </a>
                                    </div>
                                    <Button
                                        variant="outline-danger"
                                        size="sm"
                                        onClick={() => setDeletedReqUrl(editingObra.formato_requerimiento_url || '')}
                                        title="Eliminar archivo actual"
                                    >
                                        <i className="bi bi-trash"></i>
                                    </Button>
                                </div>
                            )}

                            {/* Mostrar aviso de eliminación pendiente */}
                            {deletedReqUrl && (
                                <Alert variant="warning" className="py-2 px-3 small d-flex align-items-center justify-content-between">
                                    <span><i className="bi bi-exclamation-triangle me-2"></i> Se eliminará el archivo al guardar.</span>
                                    <Button variant="link" size="sm" className="p-0 text-decoration-none" onClick={() => setDeletedReqUrl(null)}>Deshacer</Button>
                                </Alert>
                            )}

                            <Form.Control
                                type="file"
                                accept=".pdf, .xls, .xlsx"
                                onChange={(e: any) => setEditReqFile(e.target.files ? e.target.files[0] : null)}
                            />
                        </Form.Group>

                        {/* Edit Sol File Section */}
                        <Form.Group className="mb-3">
                            <Form.Label>Formato Solicitud</Form.Label>

                            {editingObra?.formato_solicitud_url && !deletedSolUrl && (
                                <div className="mb-2 d-flex align-items-center justify-content-between p-2 border rounded bg-light">
                                    <div>
                                        <small className="text-muted d-block">Archivo Actual:</small>
                                        <a href={editingObra.formato_solicitud_url} target="_blank" rel="noopener noreferrer" className="text-decoration-none fw-bold">
                                            <i className="bi bi-file-earmark-text me-1"></i> Ver archivo
                                        </a>
                                    </div>
                                    <Button
                                        variant="outline-danger"
                                        size="sm"
                                        onClick={() => setDeletedSolUrl(editingObra.formato_solicitud_url || '')}
                                        title="Eliminar archivo actual"
                                    >
                                        <i className="bi bi-trash"></i>
                                    </Button>
                                </div>
                            )}

                            {deletedSolUrl && (
                                <Alert variant="warning" className="py-2 px-3 small d-flex align-items-center justify-content-between">
                                    <span><i className="bi bi-exclamation-triangle me-2"></i> Se eliminará el archivo al guardar.</span>
                                    <Button variant="link" size="sm" className="p-0 text-decoration-none" onClick={() => setDeletedSolUrl(null)}>Deshacer</Button>
                                </Alert>
                            )}

                            <Form.Control
                                type="file"
                                accept=".pdf, .xls, .xlsx"
                                onChange={(e: any) => setEditSolFile(e.target.files ? e.target.files[0] : null)}
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                            Cancelar
                        </Button>
                        <Button variant="primary" type="submit" disabled={updating}>
                            {updating ? 'Guardando...' : 'Guardar Cambios'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </Container>
    );
};

export default GestionObras;
