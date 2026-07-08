// Headless Chromium with WORKING WebGL on GPU-less boxes.
// ANGLE wraps Mesa's software EGL (llvmpipe) — new Chromium builds removed
// SwiftShader-WebGL, and this host's vendor GL stack fails headless.
// Playwright is resolved from a sibling checkout if not installed locally.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('file:///home/xiaodongye/ws/cloudvale/node_modules/playwright/index.mjs'));
}

export async function launchGL() {
  const env = { ...process.env,
    LIBGL_ALWAYS_SOFTWARE: '1',
    GALLIUM_DRIVER: 'llvmpipe',
    __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/50_mesa.json',
  };
  return chromium.launch({
    env,
    args: ['--use-gl=angle', '--use-angle=gl-egl', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--no-sandbox', '--no-proxy-server'],
  });
}
