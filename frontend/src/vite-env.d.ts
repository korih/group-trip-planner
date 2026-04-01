/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// PNG/image imports
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
