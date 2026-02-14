import React, { useEffect, useState } from 'react';
import Navigation from './Navigation';
import { Alert } from 'react-bootstrap';


interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [showInstallPrompt, setShowInstallPrompt] = useState(false);


    useEffect(() => {
        // Detect iOS and not standalone
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

        if (isIOS && !isStandalone) {
            setShowInstallPrompt(true);
        }
    }, []);



    return (
        <div className="app-container">
            <Navigation />

            {/* iOS Install Prompt */}
            {showInstallPrompt && (
                <Alert variant="info" onClose={() => setShowInstallPrompt(false)} dismissible className="m-2">
                    <Alert.Heading>Instala la App</Alert.Heading>
                    <p>
                        Para recibir notificaciones y tener la mejor experiencia, instala esta app en tu inicio.
                        Toca el botón <strong>Compartir</strong> <span style={{ fontSize: '1.2em' }}>⎋</span> y selecciona <strong>Agregar a Inicio</strong> <span style={{ fontSize: '1.2em' }}>➕</span>.
                    </p>
                </Alert>
            )}




            <main className="main-content">
                {children}
            </main>
        </div>
    );
};

export default Layout;
