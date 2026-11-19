import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../test/customRender";
import ApprovalCard from "./ApprovalCard";
import type { PendingInterrupt } from "../domain/rfp";

describe("ApprovalCard", () => {
  describe("email approval (pricing / quote)", () => {
    const pendingInterrupt: PendingInterrupt = {
      action: "approve_pricing_send",
      subject: "Pricing request - RFP abc12345",
      body: "Hi Pricing team, please price this lane.",
    };

    it("shows the pricing-specific kicker, title, and prefilled draft", () => {
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={false} onResume={vi.fn()} />);

      expect(screen.getByText("Human approval needed")).toBeInTheDocument();
      expect(screen.getByText("Send this pricing request?")).toBeInTheDocument();
      expect(screen.getByLabelText("Subject")).toHaveValue("Pricing request - RFP abc12345");
      expect(screen.getByLabelText(/Email body/)).toHaveValue("Hi Pricing team, please price this lane.");
    });

    it("shows the quote-specific title for approve_quote_send", () => {
      render(
        <ApprovalCard
          pendingInterrupt={{ action: "approve_quote_send", subject: "Your quote", body: "Dear customer..." }}
          busy={false}
          onResume={vi.fn()}
        />,
      );
      expect(screen.getByText("Send this quote to the customer?")).toBeInTheDocument();
    });

    it("submits the (possibly edited) subject and body on approve", async () => {
      const user = userEvent.setup();
      const onResume = vi.fn();
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={false} onResume={onResume} />);

      await user.clear(screen.getByLabelText("Subject"));
      await user.type(screen.getByLabelText("Subject"), "Edited subject");
      await user.click(screen.getByRole("button", { name: "Approve & send" }));

      expect(onResume).toHaveBeenCalledWith({
        approve: true,
        subject: "Edited subject",
        body: "Hi Pricing team, please price this lane.",
      });
    });

    it("submits approve: false when the human cancels", async () => {
      const user = userEvent.setup();
      const onResume = vi.fn();
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={false} onResume={onResume} />);

      await user.click(screen.getByRole("button", { name: "Cancel this step" }));
      expect(onResume).toHaveBeenCalledWith({ approve: false });
    });

    it("disables both actions and relabels submit while busy", () => {
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={true} onResume={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel this step" })).toBeDisabled();
    });

    it("starts with empty fields when the draft has no subject or body", () => {
      render(<ApprovalCard pendingInterrupt={{ action: "approve_pricing_send" }} busy={false} onResume={vi.fn()} />);
      expect(screen.getByLabelText("Subject")).toHaveValue("");
      expect(screen.getByLabelText(/Email body/)).toHaveValue("");
    });
  });

  describe("customer response", () => {
    const pendingInterrupt: PendingInterrupt = { action: "customer_response_needed" };

    it("shows the customer-response kicker and title", () => {
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={false} onResume={vi.fn()} />);
      expect(screen.getByText("Waiting on the customer")).toBeInTheDocument();
      expect(screen.getByText("Record the customer's reply")).toBeInTheDocument();
    });

    it("defaults to simulate + accepted, and submits that decision", async () => {
      const user = userEvent.setup();
      const onResume = vi.fn();
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={false} onResume={onResume} />);

      expect(screen.getByRole("radio", { name: /Simulate a reply/ })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Accepted" })).toBeChecked();

      await user.click(screen.getByRole("button", { name: "Record reply" }));
      expect(onResume).toHaveBeenCalledWith({ mode: "simulate", decision: "accepted" });
    });

    it("submits the rejected decision when that radio is chosen", async () => {
      const user = userEvent.setup();
      const onResume = vi.fn();
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={false} onResume={onResume} />);

      await user.click(screen.getByRole("radio", { name: "Rejected" }));
      await user.click(screen.getByRole("button", { name: "Record reply" }));
      expect(onResume).toHaveBeenCalledWith({ mode: "simulate", decision: "rejected" });
    });

    it("switches to a real-reply textarea, disables submit until filled, then submits the pasted body", async () => {
      const user = userEvent.setup();
      const onResume = vi.fn();
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={false} onResume={onResume} />);

      await user.click(screen.getByRole("radio", { name: "I have a real reply" }));

      const submit = screen.getByRole("button", { name: "Record reply" });
      expect(submit).toBeDisabled();

      await user.type(screen.getByLabelText(/Paste the customer's reply/), "Thanks, we accept the quote.");
      expect(submit).toBeEnabled();

      await user.click(submit);
      expect(onResume).toHaveBeenCalledWith({ mode: "real", body: "Thanks, we accept the quote." });
    });

    it("relabels the submit button while busy", () => {
      render(<ApprovalCard pendingInterrupt={pendingInterrupt} busy={true} onResume={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Recording…" })).toBeDisabled();
    });
  });
});
