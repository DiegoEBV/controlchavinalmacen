/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.xlsx?url' {
    const content: string;
    export default content;
}
