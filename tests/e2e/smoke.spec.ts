import path from "node:path";
import { expect, test } from "@playwright/test";

/** Smoke test: upload the sample workbook → map → analyse (MOCK_AI) → review locations → every dashboard tab renders. */
test("sample workbook flows through to the dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Analyse a defect workbook" })).toBeVisible();

  // Consent gate.
  await page.getByLabel("I understand").check();
  await page.getByTestId("file-input").setInputFiles(path.join(process.cwd(), "public", "sample", "sample-defects.xlsx"));

  // Sheet selection: all six sheets.
  await expect(page.getByRole("heading", { name: "Select sheets" })).toBeVisible();
  for (const s of ["Aircon", "Lighting", "Cleaning", "Toilet", "Security", "Others"]) {
    await expect(page.getByLabel(`Include sheet ${s}`)).toBeChecked();
  }
  await page.getByRole("button", { name: /Continue to column mapping/ }).click();

  // Mapping: auto-detected columns.
  await expect(page.getByRole("heading", { name: "Confirm column mapping" })).toBeVisible();
  await expect(page.getByLabel("Source column for Description")).toHaveValue("Defect Description");
  await expect(page.getByLabel("Source column for Reported at")).toHaveValue("Date/Time Reported");
  await page.getByTestId("run-analysis").click();

  // Pipeline → location review.
  await expect(page.getByRole("heading", { name: "Review location criticality" })).toBeVisible({ timeout: 240_000 });
  await page.getByTestId("to-dashboard").click();

  // Dashboard tabs.
  await expect(page.getByText("Total records")).toBeVisible();
  const tabs: [string, RegExp | string][] = [
    ["Reclassification", "Legacy category → new category"],
    ["Recurring Issues", "Recurring issues"],
    ["Priority Queue", "Priority queue"],
    ["SLA Performance", /SLA/],
    ["Locations", "Location criticality"],
    ["System Functions", /system function/i],
    ["Manpower Plan", /headcount/i],
    ["Change Requests", "Change requests"],
    ["Data Explorer", /records/i],
  ];
  for (const [tab, marker] of tabs) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.locator("#dashboard-panel").getByText(marker).first()).toBeVisible();
  }

  // CRs were drafted for P1/P2 clusters.
  await page.getByRole("tab", { name: "Change Requests" }).click();
  await expect(page.getByText(/^CR-\d{8}-\d{3}/).first()).toBeVisible({ timeout: 120_000 });

  expect(errors).toEqual([]);
});
