import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Modal, Form, Container, Row, Col, Spinner, Alert } from 'react-bootstrap';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { getEquipos, createEquipo, updateEquipo, deleteEquipo } from '../services/equiposService';
import { getObras, getUserAssignedObras } from '../services/requerimientosService';
import { Equipo, Obra } from '../types';

// Extrae el prefijo de 3 letras del nombre
const getPrefix = (nombre: string): string =>
    nombre.trim().replace(/\s+/g, '').substring(0, 3).toUpperCase();

// Genera código correlativo: EXC001, EXC002...
// Recibe la lista actual de equipos para calcular el siguiente número
const generateCodigo = (nombre: string, equiposList: { codigo: string }[]): string => {
    const prefix = getPrefix(nombre);
    if (!prefix) return '';
    // Buscar el mayor número correlativo ya usado con ese prefijo
    const regex = new RegExp(`^${prefix}(\\d{3})$`);
    let maxNum = 0;
    for (const eq of equiposList) {
        const match = eq.codigo?.match(regex);
        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) maxNum = n;
        }
    }
    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

const GestionEquipos: React.FC = () => {
    const { selectedObra, selectObra, hasRole, user, isAdmin, loading: authLoading } = useAuth();
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [obras, setObras] = useState<Obra[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingEquipo, setEditingEquipo] = useState<Equipo | null>(null);
    const [formData, setFormData] = useState<Partial<Equipo>>({
        nombre: '',
        codigo: '',
        marca: ''
    });
    const [error, setError] = useState('');

    // Importación Excel
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);

    const canEdit = hasRole(['admin', 'coordinador', 'logistica']);

    useEffect(() => {
        loadObras();
    }, [user, isAdmin]);

    useEffect(() => {
        if (selectedObra) {
            fetchEquipos();
        }
    }, [selectedObra]);

    const loadObras = async () => {
        if (!user) return;
        try {
            let data: Obra[] = [];
            if (isAdmin) {
                const res = await getObras();
                data = res as Obra[];
            } else {
                data = await getUserAssignedObras(user.id);
            }
            setObras(data || []);
        } catch (err) {
            console.error("Error loading obras:", err);
        }
    };

    const fetchEquipos = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            const data = await getEquipos(selectedObra.id);
            setEquipos(data || []);
        } catch (err) {
            console.error(err);
            setError('Error al cargar equipos.');
        } finally {
            setLoading(false);
        }
    };

    const handleShow = (equipo?: Equipo) => {
        if (equipo) {
            setEditingEquipo(equipo);
            setFormData({
                nombre: equipo.nombre,
                codigo: equipo.codigo,
                marca: equipo.marca
            });
        } else {
            setEditingEquipo(null);
            setFormData({
                nombre: '',
                codigo: '',
                marca: ''
            });
        }
        setShowModal(true);
    };

    const handleClose = () => {
        setShowModal(false);
        setError('');
    };

    // Cuando cambia el nombre, auto-genera el código (solo en creación)
    const handleNombreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nombre = e.target.value;
        if (!editingEquipo) {
            setFormData({ ...formData, nombre, codigo: generateCodigo(nombre, equipos) });
        } else {
            setFormData({ ...formData, nombre });
        }
    };

    const handleSave = async () => {
        if (!selectedObra) return;
        if (!formData.nombre) {
            setError('El nombre es obligatorio.');
            return;
        }

        // Si no tiene código aún, generarlo
        const codigoFinal = formData.codigo?.trim() || generateCodigo(formData.nombre || '', equipos);

        try {
            if (editingEquipo) {
                await updateEquipo(editingEquipo.id, { ...formData, codigo: codigoFinal });
            } else {
                await createEquipo({ ...formData, codigo: codigoFinal, obra_id: selectedObra.id });
            }
            fetchEquipos();
            handleClose();
        } catch (err) {
            console.error(err);
            setError('Error al guardar el equipo.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este equipo?')) return;
        try {
            await deleteEquipo(id);
            fetchEquipos();
        } catch (err) {
            console.error(err);
            setError('Error al eliminar el equipo.');
        }
    };

    // ---- Importación desde Excel ----
    const handleImportClick = () => {
        setImportResult(null);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedObra) return;

        setImportLoading(true);
        setImportResult(null);
        setShowImportModal(true);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Buscar columna "nombre" o tomar la primera columna con datos
            let nombreColIndex = 0;
            if (rows.length > 0) {
                const header = rows[0].map((h: any) => String(h).toLowerCase().trim());
                const idx = header.findIndex((h: string) => h.includes('nombre'));
                if (idx !== -1) nombreColIndex = idx;
            }

            // Procesar filas (saltar encabezado si la primera fila es texto)
            const dataRows = rows.slice(0); // comenzar desde la primera fila
            // Si la primera fila es encabezado, saltarla
            const firstCell = String(rows[0]?.[nombreColIndex] || '').toLowerCase();
            const startIdx = firstCell === 'nombre' || isNaN(Number(firstCell)) && firstCell.length > 0 && rows.length > 1
                ? 1
                : 0;

            let successCount = 0;
            const errors: string[] = [];
            // Lista acumulada para calcular el correlativo correcto dentro del mismo lote
            const equiposAcumulados: { codigo: string }[] = [...equipos];

            for (let i = startIdx; i < dataRows.length; i++) {
                const row = dataRows[i];
                const nombre = String(row[nombreColIndex] || '').trim();
                if (!nombre) continue;

                const codigo = generateCodigo(nombre, equiposAcumulados);

                try {
                    await createEquipo({ nombre, codigo, obra_id: selectedObra.id });
                    // Agregar a la lista acumulada para el siguiente correlativo
                    equiposAcumulados.push({ codigo });
                    successCount++;
                } catch (err: any) {
                    errors.push(`Fila ${i + 1} ("${nombre}"): ${err?.message || 'Error al guardar'}`);
                }
            }

            setImportResult({ success: successCount, errors });
            fetchEquipos();
        } catch (err) {
            console.error(err);
            setImportResult({ success: 0, errors: ['Error al leer el archivo Excel.'] });
        } finally {
            setImportLoading(false);
            // Limpiar input para permitir subir el mismo archivo nuevamente
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (authLoading) return <div className="text-center mt-5"><Spinner animation="border" /></div>;

    return (
        <Container fluid className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4 fade-in">
                <h2 className="mb-0 fw-bold text-dark">Gestión de Equipos</h2>
                <div style={{ width: '300px' }}>
                    <Form.Select
                        value={selectedObra?.id || ''}
                        onChange={(e) => {
                            const obra = obras.find(o => o.id === e.target.value);
                            if (obra) selectObra(obra);
                        }}
                        className="shadow-sm border-0"
                    >
                        <option value="">Seleccione Obra...</option>
                        {obras.map(o => (
                            <option key={o.id} value={o.id}>{o.nombre_obra}</option>
                        ))}
                    </Form.Select>
                </div>
            </div>
            {error && <Alert variant="danger" className="shadow-sm border-0 rounded-3 mb-4">{error}</Alert>}

            <div className="custom-card fade-in">
                <Row className="mb-4">
                    <Col className="d-flex gap-2">
                        {canEdit && (
                            <>
                                <Button variant="primary" onClick={() => handleShow()}>
                                    + Nuevo Equipo
                                </Button>
                                <Button
                                    variant="success"
                                    onClick={handleImportClick}
                                    disabled={!selectedObra || importLoading}
                                    title="Importar equipos desde un archivo Excel (.xlsx). Solo se requiere la columna 'Nombre'."
                                >
                                    {importLoading ? (
                                        <><Spinner animation="border" size="sm" className="me-2" />Importando...</>
                                    ) : (
                                        '⬆ Importar desde Excel'
                                    )}
                                </Button>
                                {/* Input oculto para selección de archivo */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                            </>
                        )}
                    </Col>
                </Row>

                {loading ? (
                    <div className="text-center py-5">
                        <Spinner animation="border" variant="primary" />
                    </div>
                ) : (
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Código</th>
                                    <th>Nombre</th>
                                    <th>Marca</th>
                                    {canEdit && <th className="text-end pe-4">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {equipos.map((eq) => (
                                    <tr key={eq.id}>
                                        <td className="ps-4 fw-bold text-primary">{eq.codigo}</td>
                                        <td>{eq.nombre}</td>
                                        <td>{eq.marca}</td>
                                        {canEdit && (
                                            <td className="text-end pe-4">
                                                <Button variant="link" className="text-primary p-0 me-3" onClick={() => handleShow(eq)} title="Editar">
                                                    Editar
                                                </Button>
                                                <Button variant="link" className="text-danger p-0" onClick={() => handleDelete(eq.id)} title="Eliminar">
                                                    Eliminar
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {equipos.length === 0 && (
                                    <tr>
                                        <td colSpan={canEdit ? 4 : 3} className="text-center py-5 text-muted">
                                            No hay equipos registrados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                )}
            </div>

            {/* Modal Formulario */}
            <Modal show={showModal} onHide={handleClose}>
                <Modal.Header closeButton>
                    <Modal.Title>{editingEquipo ? 'Editar Equipo' : 'Nuevo Equipo'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Nombre *</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.nombre}
                                onChange={handleNombreChange}
                                placeholder="Ej: Excavadora"
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Código</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.codigo}
                                onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                                placeholder="Auto-generado desde el nombre"
                                maxLength={10}
                            />
                            {!editingEquipo && (
                                <Form.Text className="text-muted">
                                    Se genera automáticamente con las 3 primeras letras del nombre.
                                </Form.Text>
                            )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Marca</Form.Label>
                            <Form.Control
                                type="text"
                                value={formData.marca}
                                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave}>Guardar</Button>
                </Modal.Footer>
            </Modal>

            {/* Modal Resultado Importación */}
            <Modal show={showImportModal} onHide={() => setShowImportModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Resultado de Importación</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {importLoading ? (
                        <div className="text-center py-4">
                            <Spinner animation="border" variant="primary" className="mb-3" />
                            <p className="text-muted">Procesando archivo...</p>
                        </div>
                    ) : importResult ? (
                        <>
                            <Alert variant={importResult.errors.length === 0 ? 'success' : 'warning'}>
                                <strong>{importResult.success}</strong> equipo(s) importado(s) correctamente.
                                {importResult.errors.length > 0 && (
                                    <> Con <strong>{importResult.errors.length}</strong> error(es).</>
                                )}
                            </Alert>
                            {importResult.errors.length > 0 && (
                                <ul className="small text-danger">
                                    {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            )}
                            <p className="text-muted small mt-2">
                                <strong>Formato esperado:</strong> El archivo Excel debe tener una columna llamada <em>Nombre</em> (o se usará la primera columna). El código se genera automáticamente con las 3 primeras letras.
                            </p>
                        </>
                    ) : null}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cerrar</Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default GestionEquipos;
