import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../shared"),
            "@": path.resolve(__dirname, "./src")
        }
    },
    server: {
        proxy: {
            "/api": "http://localhost:3000"
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
                        return "vendor";
                    }
                    if (id.includes("node_modules/lucide-react")) {
                        return "icons";
                    }
                },
            },
        },
    },
});
