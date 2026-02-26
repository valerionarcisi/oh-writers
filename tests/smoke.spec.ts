import { test, expect } from "@playwright/test";

test("[OHW-000] web app health check returns ok", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(baseURL!);
  expect(response.status()).toBe(200);
});

test("[OHW-000] ws-server health check returns ok", async ({ request }) => {
  const response = await request.get("http://localhost:1234/health");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { status: string };
  expect(body.status).toBe("ok");
});
