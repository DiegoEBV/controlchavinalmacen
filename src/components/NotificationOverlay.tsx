import React from 'react';
import { Modal, Button, ListGroup } from 'react-bootstrap';

interface NotificationOverlayProps {
    show: boolean;
    notifications: any[];
    onDismiss: () => void;
}

const NotificationOverlay: React.FC<NotificationOverlayProps> = ({ show, notifications, onDismiss }) => {
    return (
        <Modal
            show={show}
            onHide={onDismiss}
            centered
            backdrop="static"
            keyboard={false}
        >
            <Modal.Header>
                <Modal.Title className="text-success fw-bold">
                    <i className="bi bi-bell-fill me-2"></i>
                    {notifications.length > 1 ? 'Nuevas Atenciones' : 'Nueva Atención'}
                </Modal.Title>
                <button type="button" className="btn-close" aria-label="Close" onClick={onDismiss}></button>
            </Modal.Header>
            <Modal.Body className="text-center py-4">
                <div className="mb-3">
                    <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '3rem' }}></i>
                </div>

                {notifications.length === 1 ? (
                    <h5 className="mb-3">{notifications[0].message}</h5>
                ) : (
                    <div className="text-start" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        <h6 className="text-center mb-3">Se han atendido los siguientes materiales:</h6>
                        <ListGroup variant="flush">
                            {notifications.map((n, idx) => (
                                <ListGroup.Item key={n.id || idx} className="border-0 py-2">
                                    <i className="bi bi-dot me-2"></i>
                                    {n.message}
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    </div>
                )}

                <p className="text-muted small mt-3">Este mensaje desaparecerá cuando lo cierres.</p>
            </Modal.Body>
            <Modal.Footer className="justify-content-center">
                <Button variant="success" onClick={onDismiss} className="px-4">
                    Entendido ({notifications.length})
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default NotificationOverlay;
