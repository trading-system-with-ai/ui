/**
 * §47 dialog component tests (upgrade 2026-08-12): focus trap, cancel,
 * confirm, ESC, destructive state, loading state, disabled submit, keyboard
 * navigation — against the REAL Modal/ConfirmDialog the app ships.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";

afterEach(cleanup);

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Apply plan"
      confirmLabel="Apply"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    >
      <p>Consequences stated here.</p>
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog (§47)", () => {
  it("renders ARIA dialog semantics with the title", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Apply plan");
  });

  it("confirm fires onConfirm; cancel fires onCancel", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ESC closes (fires onCancel)", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("loading state blocks confirm, cancel and ESC (no double-submit)", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({ loading: true });
    const confirm = screen.getByRole("button", { name: "Working…" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disabled submit blocks confirm while cancel stays available", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({ disabled: true });
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("destructive state styles the confirm action as danger", () => {
    renderDialog({ destructive: true });
    expect(screen.getByRole("button", { name: "Apply" }).className).toContain(
      "danger",
    );
  });

  it("keyboard navigation: Tab cycles focus INSIDE the dialog (focus trap)", async () => {
    const user = userEvent.setup();
    renderDialog();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Apply" });
    const close = screen.getByRole("button", { name: "Close dialog" });

    // Tab from the last focusable wraps to the first — never leaves.
    confirm.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);
    // Shift+Tab from the first wraps back to the last.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
  });
});

describe("Modal (§47/§29)", () => {
  it("returns focus to the opener on unmount", async () => {
    const opener = document.createElement("button");
    opener.textContent = "open";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <Modal title="T" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("clicking the backdrop closes; clicking inside does not", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Modal title="T" onClose={onClose}>
        <p>body content</p>
      </Modal>,
    );
    await user.click(screen.getByText("body content"));
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = container.querySelector(".modal-backdrop")!;
    await user.pointer({ keys: "[MouseLeft]", target: backdrop });
    expect(onClose).toHaveBeenCalled();
  });
});
