import { describe, expect, it } from "vitest";
import { render, screen } from "../test/customRender";
import MessageThread from "./MessageThread";
import type { Message } from "../types";

describe("MessageThread", () => {
  it("shows an empty-state message when there are no messages", () => {
    render(<MessageThread messages={[]} />);
    expect(screen.getByText("No messages exchanged yet.")).toBeInTheDocument();
  });

  it("renders each message with its thread, direction, subject and body", () => {
    const messages: Message[] = [
      { thread: "PRICING", direction: "outbound", subject: "Pricing request", body: "Please price this lane." },
      { thread: "CUSTOMER", direction: "inbound", subject: "Re: Your quote", body: "Looks good, we accept." },
    ];
    render(<MessageThread messages={messages} />);

    expect(screen.getByText("PRICING · Sent")).toBeInTheDocument();
    expect(screen.getByText("Pricing request")).toBeInTheDocument();
    expect(screen.getByText("Please price this lane.")).toBeInTheDocument();

    expect(screen.getByText("CUSTOMER · Received")).toBeInTheDocument();
    expect(screen.getByText("Re: Your quote")).toBeInTheDocument();
    expect(screen.getByText("Looks good, we accept.")).toBeInTheDocument();
  });
});
