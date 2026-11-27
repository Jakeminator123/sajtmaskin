import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SourcePagePanel } from "./SourcePagePanel";

afterEach(() => vi.unstubAllGlobals());

it("keeps reading separate from a rights-approved image import and returns the chosen passage and source", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({
      url: "https://example.com/atelier", title: "Ateljén",
      passages: ["Första stycket", "Valt stycke"],
      images: [{ url: "https://images.example/chair.png", alt: "Stol i ek" }],
    }))
    .mockResolvedValueOnce(Response.json({
      media: { id: 42, url: "https://blob.example/chair.png", filename: "chair.png", contentType: "image/png" },
    }));
  vi.stubGlobal("fetch", fetchMock);
  const onUse = vi.fn();
  render(<SourcePagePanel chatId="chat-owner" onUse={onUse} />);
  fireEvent.click(screen.getByText("Läs en webbsida"));
  fireEvent.change(screen.getByLabelText("Publik URL"), { target: { value: "https://example.com/atelier" } });
  fireEvent.click(screen.getByRole("button", { name: "Läs sidan" }));
  await screen.findByText("Ateljén");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(onUse).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Textstycke"), { target: { value: "Valt stycke" } });
  fireEvent.change(screen.getByLabelText("Bild"), { target: { value: "https://images.example/chair.png" } });
  expect((screen.getByRole("button", { name: "Använd i utkastet" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Jag får återanvända bilden"));
  fireEvent.click(screen.getByRole("button", { name: "Använd i utkastet" }));
  await waitFor(() => expect(onUse).toHaveBeenCalledWith({
    url: "https://example.com/atelier",
    passage: "Valt stycke",
    image: { url: "https://images.example/chair.png", alt: "Stol i ek" },
  }, expect.objectContaining({ id: "42", url: "https://blob.example/chair.png" })));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toMatchObject({
    chatId: "chat-owner", sourcePageUrl: "https://example.com/atelier", url: "https://images.example/chair.png",
  });
});
