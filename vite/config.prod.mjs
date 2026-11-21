import { defineConfig } from 'vite';
import { rmSync } from 'node:fs';

// GRID data licence: the pro pack must never end up in a build that gets hosted.
// Local booth builds can keep it with INCLUDE_PRO_PACK=1.
const dropProPack = () => ({
    name: 'drop-pro-pack',
    closeBundle() {
        if (process.env.INCLUDE_PRO_PACK !== '1') rmSync('dist/packs/pro', { recursive: true, force: true });
    }
});

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);
            
            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}   

export default defineConfig({
    base: './',
    logLevel: 'warning',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    server: {
        port: 8080
    },
    plugins: [
        phasermsg(),
        dropProPack()
    ]
});
