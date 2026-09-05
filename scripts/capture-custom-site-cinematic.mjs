// Compatibility entry point: <productionBaseUrl> <candidateDirectory>.
// Renders the 60s master and a native-speed, editorially shortened 30s cut.
process.argv.splice(2, 0, 'custom');
await import('./capture-video-set.mjs');
