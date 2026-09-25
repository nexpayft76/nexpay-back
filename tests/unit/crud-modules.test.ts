import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { usersRouter } from "../../src/modules/users/users.routes";
import { walletsRouter } from "../../src/modules/wallets/wallets.routes";
import { currenciesRouter } from "../../src/modules/currencies/currencies.routes";

describe("CRUD modules", () => {
  it("should expose the users router", () => {
    assert.ok(usersRouter);
  });

  it("should expose the wallets router", () => {
    assert.ok(walletsRouter);
  });

  it("should expose the currencies router", () => {
    assert.ok(currenciesRouter);
  });
});
