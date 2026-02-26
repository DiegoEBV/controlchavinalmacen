import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal, Badge, InputGroup } from 'react-bootstrap';
import { FaEdit, FaArchive, FaBoxOpen } from 'react-icons/fa';
import { EppC } from '../types';
import { getEpps, createEpp, updateEpp, toggleEppStatus, getNextEppCode, createEppsBatch } from '../services/eppsService';
import { useAuth } from '../context/AuthContext';
import PaginationControls from '../components/PaginationControls';

const GestionEPPs: React.FC = () => {
    const { hasRole } = useAuth();
    const canEdit = hasRole(['admin', 'coordinador', 'logistica']);

    const [epps, setEpps] = useState<EppC[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const pageSize = 15;

    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    const [currentEpp, setCurrentEpp] = useState<Partial<EppC>>({
        descripcion: '',
        unidad: 'UND',
        tipo: 'Personal',
        activo: true
    });
    const [isEditing, setIsEditing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [predictedCode, setPredictedCode] = useState('Cargando...');

    useEffect(() => {
        const fetchNextCode = async () => {
            if (!isEditing && currentEpp.tipo) {
                setPredictedCode('Calculando...');
                const code = await getNextEppCode(currentEpp.tipo);
                setPredictedCode(code);
            }
        };
        fetchNextCode();
    }, [currentEpp.tipo, isEditing, showModal]);

    useEffect(() => {
        loadEpps();
    }, [showArchived, currentPage, searchTerm]);

    const loadEpps = async () => {
        setLoading(true);
        try {
            const { data, count } = await getEpps(showArchived, currentPage, pageSize, searchTerm);
            setEpps(data || []);
            setTotalItems(count || 0);
        } catch (error) {
            console.error("Error loading EPPs:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    const handleOpenModal = (epp?: EppC) => {
        if (epp) {
            setCurrentEpp(epp);
            setIsEditing(true);
        } else {
            setCurrentEpp({
                descripcion: '',
                unidad: 'UND',
                tipo: 'Personal',
                activo: true
            });
            setIsEditing(false);
        }
        setErrorMsg('');
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!currentEpp.descripcion) {
            setErrorMsg("La descripción es obligatoria");
            return;
        }

        try {
            if (isEditing && currentEpp.id) {
                await updateEpp(currentEpp.id, currentEpp);
            } else {
                await createEpp(currentEpp as EppC);
            }
            setShowModal(false);
            loadEpps();
        } catch (error) {
            console.error("Error saving EPP:", error);
            setErrorMsg("Error al guardar. Verifique los datos.");
        }
    };

    const handleToggleStatus = async (epp: EppC) => {
        if (!confirm(`¿Está seguro de ${epp.activo ? 'archivar' : 'activar'} este ítem?`)) return;
        try {
            await toggleEppStatus(epp.id, epp.activo);
            loadEpps();
        } catch (error) {
            console.error("Error toggling status:", error);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const XLSX = await import('xlsx');
            const reader = new FileReader();

            reader.onload = async (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    alert("El archivo está vacío");
                    return;
                }

                // 1. Get initial next codes from DB
                const nextMetaPersonal = await getNextEppCode('Personal');
                const nextMetaColectivo = await getNextEppCode('Colectivo');

                let pCounter = parseInt(nextMetaPersonal.split('-')[1]);
                let cCounter = parseInt(nextMetaColectivo.split('-')[1]);

                const batchToInsert: any[] = [];
                let skipped = 0;

                for (const row of data as any[]) {
                    // Normalize keys
                    const norm: any = {};
                    Object.keys(row).forEach(k => {
                        norm[k.toLowerCase().trim()] = row[k];
                    });

                    const descripcion = norm.descripcion || norm.nombre || norm.item;
                    const tipoRaw = norm.tipo || 'Personal'; // Default
                    const unidad = norm.unidad || 'UND';

                    if (!descripcion) {
                        skipped++;
                        continue;
                    }

                    // Determine Type
                    const tipo = tipoRaw.toString().toLowerCase().includes('colectivo') ? 'Colectivo' : 'Personal';

                    // Generate Code
                    let code = '';
                    if (tipo === 'Personal') {
                        code = `EPP-${String(pCounter).padStart(4, '0')}`;
                        pCounter++;
                    } else {
                        code = `EPC-${String(cCounter).padStart(4, '0')}`;
                        cCounter++;
                    }

                    batchToInsert.push({
                        codigo: code,
                        descripcion: descripcion,
                        tipo: tipo,
                        unidad: unidad,
                        activo: true
                    });
                }

                if (batchToInsert.length > 0) {
                    try {
                        await createEppsBatch(batchToInsert);
                        alert(`Importación exitosa.\nRegistros agregados: ${batchToInsert.length}\nOmitidos: ${skipped}`);
                        loadEpps();
                    } catch (err) {
                        console.error(err);
                        alert("Error al guardar en base de datos. Verifique consola.");
                    }
                } else {
                    alert("No se encontraron datos válidos para importar.");
                }
            };
            reader.readAsBinaryString(file);
        } catch (error) {
            console.error("Error importing:", error);
            alert("Error al procesar el archivo.");
        } finally {
            e.target.value = ''; // Reset input
        }
    };

    const totalPages = Math.ceil(totalItems / pageSize);

    return (
        <Container className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4 fade-in">
                <h2 className="mb-0 fw-bold text-dark">Gestión de EPPs y Colectivos</h2>
            </div>

            <div className="custom-card fade-in">
                <Row className="g-3 align-items-center mb-4">
                    <Col md={6}>
                        <InputGroup>
                            <Form.Control
                                placeholder="Buscar por descripción o código..."
                                value={searchTerm}
                                onChange={handleSearch}
                            />
                        </InputGroup>
                    </Col>
                    <Col md={6} className="d-flex justify-content-end align-items-center gap-3">
                        <Form.Check
                            type="switch"
                            id="show-archived"
                            label="Mostrar Archivados"
                            checked={showArchived}
                            onChange={e => setShowArchived(e.target.checked)}
                            className="mb-0 mt-1"
                        />
                        {canEdit && (
                            <div className="d-flex gap-2">
                                <label className="btn btn-success text-white mb-0 shadow-sm">
                                    Importar Excel
                                    <input type="file" hidden accept=".xlsx, .xls" onChange={handleImport} />
                                </label>
                                <Button variant="primary" onClick={() => handleOpenModal()} className="shadow-sm">
                                    + Nuevo Ítem
                                </Button>
                            </div>
                        )}
                    </Col>
                </Row>

                {loading ? (
                    <div className="text-center py-5">
                        <div className="spinner-border text-primary" role="status">
                            <span className="visually-hidden">Cargando...</span>
                        </div>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <Table hover className="table-borderless-custom align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Código</th>
                                    <th>Descripción</th>
                                    <th>Tipo</th>
                                    <th>Unidad</th>
                                    <th>Estado</th>
                                    {canEdit && <th className="text-end pe-4">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {epps.length > 0 ? epps.map(epp => (
                                    <tr key={epp.id} className={!epp.activo ? 'table-secondary opacity-75' : ''}>
                                        <td>{epp.codigo || '-'}</td>
                                        <td>{epp.descripcion}</td>
                                        <td>
                                            <Badge bg={epp.tipo === 'Personal' ? 'info' : 'warning'} text="dark">
                                                {epp.tipo}
                                            </Badge>
                                        </td>
                                        <td>{epp.unidad}</td>
                                        <td>
                                            {epp.activo ? <Badge bg="success">Activo</Badge> : <Badge bg="secondary">Archivado</Badge>}
                                        </td>
                                        {canEdit && (
                                            <td>
                                                <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handleOpenModal(epp)} title="Editar">
                                                    <FaEdit />
                                                </Button>
                                                <Button
                                                    variant={epp.activo ? "outline-danger" : "outline-success"}
                                                    size="sm"
                                                    onClick={() => handleToggleStatus(epp)}
                                                    title={epp.activo ? "Archivar" : "Activar"}
                                                >
                                                    {epp.activo ? <FaArchive /> : <FaBoxOpen />}
                                                </Button>
                                            </td>
                                        )}
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={7} className="text-center py-3">No se encontraron ítems</td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                        <div className="px-3 pb-3">
                            <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setCurrentPage} />
                        </div>
                    </div>
                )}
            </div>

            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>{isEditing ? 'Editar EPP' : 'Nuevo EPP'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Código</Form.Label>
                            <Form.Control
                                value={currentEpp.id ? currentEpp.codigo : predictedCode}
                                readOnly
                                disabled
                                className="bg-light fw-bold"
                            />
                            <Form.Text className="text-muted">
                                {currentEpp.id ? 'Código asignado' : 'Código preliminar (se confirmará al guardar)'}
                            </Form.Text>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Descripción *</Form.Label>
                            <Form.Control
                                value={currentEpp.descripcion || ''}
                                onChange={e => setCurrentEpp({ ...currentEpp, descripcion: e.target.value })}
                                placeholder="Nombre del equipo..."
                                required
                            />
                        </Form.Group>
                        <Row>
                            <Col>
                                <Form.Group className="mb-3">
                                    <Form.Label>Tipo</Form.Label>
                                    <Form.Select
                                        value={currentEpp.tipo}
                                        onChange={e => setCurrentEpp({ ...currentEpp, tipo: e.target.value as any })}
                                    >
                                        <option value="Personal">Personal</option>
                                        <option value="Colectivo">Colectivo</option>
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                            <Col>
                                <Form.Group className="mb-3">
                                    <Form.Label>Unidad</Form.Label>
                                    <Form.Control
                                        value={currentEpp.unidad}
                                        onChange={e => setCurrentEpp({ ...currentEpp, unidad: e.target.value.toUpperCase() })}
                                    />
                                </Form.Group>
                            </Col>
                        </Row>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave}>Guardar</Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default GestionEPPs;
