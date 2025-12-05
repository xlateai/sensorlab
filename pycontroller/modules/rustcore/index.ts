// Reexport the native module. On web, it will be resolved to RustcoreModule.web.ts
// and on native platforms to RustcoreModule.ts
export { default } from './src/RustcoreModule';
export { default as RustcoreView } from './src/RustcoreView';
export * from  './src/Rustcore.types';
