import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integrationstesterna (rewardShop/todos/timedTasks) delar samma MongoDB-databas
    // i CI och gör var sin dropDatabase() i afterAll — måste köras i sekvens, annars
    // kan en fils städning radera en annan fils data mitt i körningen.
    fileParallelism: false,
  },
});
