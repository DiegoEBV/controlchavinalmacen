import React from 'react';
import { Row, Col } from 'react-bootstrap';

const InsumoSkeleton: React.FC = () => {
    return (
        <Row className="mb-3 g-2 bg-light p-2 rounded animate-pulse" style={{ opacity: 0.6 }}>
            <Col md={2}>
                <div className="skeleton-box" style={{ height: '38px', width: '100%', borderRadius: '4px', background: '#e0e0e0' }}></div>
            </Col>
            <Col md={2}>
                <div className="skeleton-box" style={{ height: '38px', width: '100%', borderRadius: '4px', background: '#e0e0e0' }}></div>
            </Col>
            <Col md={5}>
                <div className="skeleton-box" style={{ height: '38px', width: '100%', borderRadius: '4px', background: '#e0e0e0' }}></div>
            </Col>
            <Col md={1}>
                <div className="skeleton-box" style={{ height: '38px', width: '100%', borderRadius: '4px', background: '#e0e0e0' }}></div>
            </Col>
            <Col md={2}>
                <div className="skeleton-box" style={{ height: '38px', width: '100%', borderRadius: '4px', background: '#e0e0e0' }}></div>
            </Col>
            <style>{`
                .animate-pulse {
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
                .skeleton-box {
                    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.5s infinite;
                }
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </Row>
    );
};

export default InsumoSkeleton;
