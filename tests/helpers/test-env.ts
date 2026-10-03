// Variables de entorno para los tests. Se importa ANTES que cualquier módulo de src/ (env.ts lee process.env al cargarse).
// Se pisan siempre, aunque exista un .env: los tests nunca deben apuntar a una base de datos real.
process.env.NODE_ENV = "test";
// Por defecto, un puerto inexistente a propósito: ningún test puede tocar una base de datos por accidente.
// Los tests con base real (*.db.test.ts) solo corren si se define TEST_DATABASE_URL, y esa base debe llamarse "*test*".
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl && !/test/i.test(new URL(testDatabaseUrl).pathname)) {
  throw new Error("TEST_DATABASE_URL tiene que apuntar a una base descartable cuyo nombre incluya 'test'");
}
process.env.DATABASE_URL = testDatabaseUrl ?? "postgresql://test:test@127.0.0.1:1/nexpay_test";
process.env.DB_SSL = "false";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.JWT_EXPIRES_IN = "1h";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.ADMIN_EMAILS = "";
