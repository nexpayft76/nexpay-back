import "../helpers/test-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changePasswordSchema, closeAccountSchema, updateMeSchema } from "../../src/modules/users/users.middlewares";

describe("PATCH /users/me: esquema", () => {
  it("acepta nombre, email o ambos", () => {
    assert.equal(updateMeSchema.safeParse({ full_name: "Ana Pérez" }).success, true);
    assert.equal(updateMeSchema.safeParse({ email: "ana@nexpay.com" }).success, true);
    assert.equal(updateMeSchema.safeParse({ full_name: "Ana Pérez", email: "ana@nexpay.com" }).success, true);
  });

  it("recorta el nombre y pasa el email a minúsculas", () => {
    const result = updateMeSchema.parse({ full_name: "  Ana Pérez  ", email: "  ANA@NexPay.com " });
    assert.deepEqual(result, { full_name: "Ana Pérez", email: "ana@nexpay.com" });
  });

  it("rechaza un body vacío", () => {
    assert.equal(updateMeSchema.safeParse({}).success, false);
  });

  it("rechaza cualquier campo que no sea nombre o email (status, password, id...)", () => {
    for (const extra of [{ status: "active" }, { password: "Secreta123" }, { id: "x" }, { theme: "dark" }]) {
      assert.equal(updateMeSchema.safeParse({ full_name: "Ana Pérez", ...extra }).success, false);
    }
  });

  it("valida el largo del nombre", () => {
    assert.equal(updateMeSchema.safeParse({ full_name: "A" }).success, false);
    assert.equal(updateMeSchema.safeParse({ full_name: "  A  " }).success, false);
    assert.equal(updateMeSchema.safeParse({ full_name: "A".repeat(120) }).success, true);
    assert.equal(updateMeSchema.safeParse({ full_name: "A".repeat(121) }).success, false);
  });

  it("valida el formato y el largo del email", () => {
    assert.equal(updateMeSchema.safeParse({ email: "no-es-un-email" }).success, false);
    assert.equal(updateMeSchema.safeParse({ email: "" }).success, false);
    assert.equal(updateMeSchema.safeParse({ email: `${"a".repeat(250)}@x.com` }).success, false);
  });

  it("rechaza tipos incorrectos", () => {
    assert.equal(updateMeSchema.safeParse({ full_name: 123 }).success, false);
    assert.equal(updateMeSchema.safeParse({ email: null }).success, false);
  });
});

describe("DELETE /users/me: esquema", () => {
  it("exige la contraseña", () => {
    assert.equal(closeAccountSchema.safeParse({ password: "Secreta123" }).success, true);
    assert.equal(closeAccountSchema.safeParse({}).success, false);
    assert.equal(closeAccountSchema.safeParse({ password: "" }).success, false);
    assert.equal(closeAccountSchema.safeParse({ password: 123 }).success, false);
  });

  it("no acepta campos extra", () => {
    assert.equal(closeAccountSchema.safeParse({ password: "Secreta123", force: true }).success, false);
  });
});

describe("PATCH /users/me/password: esquema", () => {
  const valid = { current_password: "Secreta123", new_password: "NuevaSecreta456" };

  it("acepta la contraseña actual y una nueva válida", () => {
    assert.equal(changePasswordSchema.safeParse(valid).success, true);
  });

  it("exige ambos campos", () => {
    assert.equal(changePasswordSchema.safeParse({ new_password: valid.new_password }).success, false);
    assert.equal(changePasswordSchema.safeParse({ current_password: valid.current_password }).success, false);
    assert.equal(changePasswordSchema.safeParse({ ...valid, current_password: "" }).success, false);
  });

  it("aplica las reglas del registro a la nueva contraseña", () => {
    for (const bad of ["Corta1", "sololetrasaqui", "12345678", "a1".repeat(37)]) {
      assert.equal(changePasswordSchema.safeParse({ ...valid, new_password: bad }).success, false, bad);
    }
  });

  it("rechaza campos desconocidos", () => {
    assert.equal(changePasswordSchema.safeParse({ ...valid, status: "active" }).success, false);
  });
});
