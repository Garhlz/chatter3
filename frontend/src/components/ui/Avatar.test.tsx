import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("uses the first nickname character when no avatar image is available", () => {
    render(<Avatar user={{ username: "elaine", nickname: "伊莱恩" }} />);
    expect(screen.getByText("伊")).toBeInTheDocument();
  });

  it("renders a presence marker when online state is known", () => {
    const { container } = render(
      <Avatar user={{ username: "elaine", nickname: "Elaine" }} online />,
    );
    expect(container.querySelector(".avatar-presence.is-online")).toBeInTheDocument();
  });
});
