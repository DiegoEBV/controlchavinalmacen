/// <reference types="vite/client" />

declare module '*.xlsx?url' {
    const content: string;
    export default content;
}
