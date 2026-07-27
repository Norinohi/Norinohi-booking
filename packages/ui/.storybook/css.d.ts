// Storybook's preview imports the global stylesheet for its side effect.
// Vite handles the actual CSS; TypeScript just needs the module to exist.
declare module "*.css";
